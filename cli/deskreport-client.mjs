// Client local do DeskReport: liga os agentes da máquina com a api.deskreport.com.br
// Roda os agentes só quando o painel dispara uma tarefa e serve o widget em 127.0.0.1:4399
// Uso: deskreport [start|setup|login|widget|mcp] [--widget] [--agent <agente>]
import { spawn, execFile, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const devEnv = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(devEnv)) process.loadEnvFile(devEnv);

const localPort = 4399;
const widgetUrl = `http://127.0.0.1:${localPort}/widget`;
const configDir = path.join(os.homedir(), '.config', 'deskreport');
const configPath = path.join(configDir, 'config.json');
const statePath = path.join(configDir, 'state.json');
const logPath = path.join(configDir, 'client.log');
const agentLabels = { claude: 'Claude Code', opencode: 'OpenCode', antigravity: 'Antigravity', codex: 'Codex', gemini: 'Gemini', aider: 'Aider' };
const agentBins = { claude: 'claude', opencode: 'opencode', antigravity: 'agy', codex: 'codex', gemini: 'gemini', aider: 'aider' };
const agentNames = Object.keys(agentLabels);
const clientScript = fileURLToPath(import.meta.url);

// Cargos de uma empresa de software que cada agente pode assumir nesta máquina
const roleCatalog = {
  engineering: ['Engenharia e Implementação', 'Escreve código limpo, cria features, refatora e resolve bugs seguindo a arquitetura.'],
  review: ['Code Review e Governança', 'Audita diffs e PRs, valida segurança multi-tenant, simplicidade e ausência de travessões.'],
  qa: ['QA e Testes de Navegador', 'Abre páginas via Chrome DevTools, reproduz bugs e valida UI e fluxos ponta a ponta.'],
  architecture: ['Arquitetura e Especificação', 'Modela banco de dados, escreve specs (SPEC-*.md), rotas e contratos de API.'],
  devops: ['DevOps e Infraestrutura', 'Scripts de build, deploys, migrations de banco, Docker e pacotes de release.'],
  documentation: ['Documentação Técnica', 'Cria e atualiza READMEs, OpenAPI/Swagger, tutoriais e notas de versão.'],
  support: ['Suporte Técnico L3', 'Analisa logs de erro em produção, investiga chamados e aponta correções.'],
};
const roleNames = Object.keys(roleCatalog);
const defaultRoles = { antigravity: ['architecture', 'review'], claude: ['engineering', 'devops'], opencode: ['qa', 'documentation'] };
const rolesStart = '<!-- DESKREPORT_ROLES_START -->';
const rolesEnd = '<!-- DESKREPORT_ROLES_END -->';
// Arquivo de instruções global de cada harness
const instructionFiles = {
  claude: path.join(os.homedir(), '.claude', 'CLAUDE.md'),
  antigravity: path.join(os.homedir(), '.gemini', 'config', 'GEMINI.md'),
  opencode: path.join(os.homedir(), '.config', 'opencode', 'AGENTS.md'),
  codex: path.join(os.homedir(), '.codex', 'AGENTS.md'),
  gemini: path.join(os.homedir(), '.gemini', 'GEMINI.md'),
};

// Safety Gate pela cota usada: aviso com 60% restante, pausa que o humano libera com 40% e bloqueio obrigatório com 20%
const QUOTA_WARN = 0.4;
const QUOTA_STOP = 0.6;
const QUOTA_BLOCK = 0.8;
const alertLevels = ['warn', 'stop', 'block'];
// Agente que passa disso sem terminar é encerrado, e a tarefa volta como falha
const TASK_TIMEOUT_MS = 60 * 60_000;
// Tempo que o agente tem para sair sozinho depois do SIGTERM antes do SIGKILL
const KILL_GRACE_MS = 5_000;
// Mensagem de cota esgotada dos agentes que não informam o percentual (OpenCode, Gemini, Codex...)
const LIMIT_PATTERN = /usage limit reached|limit reached|resource_exhausted|quota exceeded|exceeded your current quota/i;

const queues = {};
const running = {};
// Função que para o agente de cada tarefa em execução, pelo taskId
const stoppers = {};
// Cota usada por agente (só o Claude Code informa o percentual) e alerta de cota { level, message }
const quotas = {};
const alerts = {};
const agents = {};
for (const agent of agentNames) agents[agent] = { state: 'idle' };
let detectedAgents = [];
let enabledAgents = [];
let logs = [];
let widgetClients = [];
let socket;
let config;
let workspaceRoot;
let authPending = false;

// Ordem: variáveis de ambiente e depois ~/.config/deskreport/config.json
function loadConfig() {
  const saved = readJson(configPath);
  const root = process.env.WORKSPACE_ROOT || saved.workspaceRoot;

  return {
    apiUrl: process.env.DESKREPORT_API_URL || saved.apiUrl || 'https://api.deskreport.com.br',
    webUrl: process.env.DESKREPORT_WEB_URL || saved.webUrl || 'https://app.deskreport.com.br',
    machineToken: process.env.DESKREPORT_MACHINE_TOKEN || saved.machineToken || process.env.DESKREPORT_DEV_TOKEN,
    workspaceRoot: root ? path.resolve(root) : '',
    organizationName: saved.organizationName,
    enabledAgents: Array.isArray(saved.enabledAgents) ? agentNames.filter((agent) => saved.enabledAgents.includes(agent)) : undefined,
    agentRoles: saved.agentRoles || defaultRoles,
    models: saved.models,
    alerts: saved.alerts !== false,
  };
}

function saveConfig(changes) {
  const saved = { ...readJson(configPath), ...changes };
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  writeFileSync(configPath, JSON.stringify(saved, null, 2), { mode: 0o600 });
  chmodSync(configPath, 0o600);
}

// Wizard do terminal: pergunta a pasta e segue para o login no navegador
async function setup() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const fallback = workspaceRoot || process.cwd();
  const answer = await rl.question(`Pasta raiz dos projetos (${fallback}): `);
  rl.close();

  const ok = await authorize(path.resolve(answer.trim() || fallback));
  if (!ok) {
    console.error('Tempo esgotado esperando a autorização no navegador');
    process.exit(1);
  }
}

// Login OAuth no navegador: um servidor temporário recebe o token no /callback
function authorize(root) {
  const state = randomBytes(16).toString('hex');

  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const token = url.searchParams.get('token') || '';
      if (url.pathname !== '/callback' || url.searchParams.get('state') !== state || !token.startsWith('drk_')) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Pedido inválido');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(connectedHtml);
      server.close();
      clearTimeout(timer);

      const organizationName = url.searchParams.get('org') || '';
      saveConfig({ apiUrl: config.apiUrl, webUrl: config.webUrl, machineToken: token, workspaceRoot: root || undefined, organizationName });
      // Variável de ambiente continua tendo prioridade sobre o arquivo
      config = loadConfig();
      workspaceRoot = config.workspaceRoot;
      enabledAgents = config.enabledAgents || detectedAgents;
      console.log(`Máquina conectada à organização ${organizationName}. Config salva em ${configPath}`);
      resolve(true);
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const authUrl = `${config.webUrl}/cli/auth?port=${port}&state=${state}&name=${encodeURIComponent(os.hostname())}&workspace=${encodeURIComponent(root)}`;
      console.log(`Abrindo o navegador para autorizar a máquina:\n${authUrl}`);
      openUrl(authUrl);
    });

    const timer = setTimeout(() => {
      server.close();
      resolve(false);
    }, 5 * 60 * 1000);
  });
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function connectSocket() {
  syncMcpConfig(enabledAgents);
  socket?.disconnect();
  // auth como função para cada reconexão levar a lista de agentes atual
  socket = io(config.apiUrl, { auth: (cb) => cb({ machineToken: config.machineToken, agents: enabledAgents }), transports: ['websocket'] });

  socket.on('connect', () => {
    console.log(`Conectado em ${config.apiUrl}`);
    socket.emit('machine:roles-updated', { roles: config.agentRoles });
    broadcast();
    // Retoma a fila salva e reenvia o alerta de quem continua travado
    for (const agent of agentNames) startNext(agent);
  });
  socket.on('disconnect', (reason) => {
    console.log(`Desconectado: ${reason}`);
    broadcast();
    if (reason === 'io server disconnect') setTimeout(() => socket.connect(), 2000);
  });
  socket.on('connect_error', (error) => console.log(`Falha ao conectar: ${error.message}`));
  socket.on('agent:dispatch', enqueueTask);
  socket.on('agent:chat', runChat);
  socket.on('agent:team-message', runTeamMessage);
  socket.on('agent:quota-continue', (data) => continueAgent(data?.agent));
  socket.on('agent:stop-task', stopTask);
}

// Resolve false quando a porta já está em uso, ou seja, outro DeskReport já está rodando
function startLocalServer() {
  return new Promise((resolve) => {
    const server = createServer(handleLocal);
    server.on('error', () => resolve(false));
    server.listen(localPort, '127.0.0.1', () => {
      console.log(`Widget em ${widgetUrl}`);
      resolve(true);
    });
  });
}

async function isRunning() {
  try {
    const res = await fetch(`http://127.0.0.1:${localPort}/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Sobe o client sem terminal: o processo filho fica solto e escreve o log em ~/.config/deskreport/client.log
function startBackground(args) {
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  const log = openSync(logPath, 'a');
  spawn(process.execPath, [clientScript, ...args], {
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true,
    env: { ...process.env, DESKREPORT_BACKGROUND: '1' },
  }).unref();
}


function handleLocal(req, res) {
  // Bloqueia DNS rebinding: só atende quem chama pelo próprio 127.0.0.1 ou localhost
  const host = req.headers.host || '';
  if (host !== `127.0.0.1:${localPort}` && host !== `localhost:${localPort}`) {
    res.writeHead(403).end();
    return;
  }

  // Bloqueia sites de fora disparando ações no client pelo navegador
  const origin = req.headers.origin;
  const url = new URL(req.url, `http://${host}`);
  const route = `${req.method} ${url.pathname}`;
  const fromWidget = origin === `http://${host}`;
  if ((origin && !fromWidget) || (route.startsWith('POST /') && !fromWidget)) {
    res.writeHead(403).end();
    return;
  }

  if (route === 'GET /fs/dirs') return listDirs(url.searchParams.get('path'), res);
  if (route === 'POST /config/workspace') return changeWorkspace(req, res);
  if (route === 'GET /projects/folders') return sendJson(res, 200, { folders: workspaceFolders() });
  if (route === 'POST /projects/sync') return syncProjects(res);
  if (route === 'POST /config/agents') return changeAgents(req, res);
  if (route === 'POST /config/models') return changeModel(req, res);
  if (route === 'POST /config/agent-roles') return changeRoles(req, res);
  if (route === 'POST /quota/continue') return readJsonBody(req, (data) => sendJson(res, 200, { ok: continueAgent(data?.agent) }));
  if (route === 'POST /auth/start') return startAuth(res);
  if (route === 'POST /config/preferences') return changePreferences(req, res);
  if (route === 'POST /quit') return quit(res);
  if (route === 'GET /health') return sendJson(res, 200, { ok: true });
  if (route === 'POST /open-web') {
    openUrl(config.webUrl);
    return sendJson(res, 200, { ok: true });
  }
  if (route === 'GET /icon.svg') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end(iconSvg);
    return;
  }
  if (route === 'GET /widget') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(widgetHtml);
    return;
  }
  if (route === 'GET /events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(widgetState())}\n\n`);
    widgetClients.push(res);
    req.on('close', () => (widgetClients = widgetClients.filter((client) => client !== res)));
    return;
  }
  res.writeHead(404).end();
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(data));
}

function readJsonBody(req, done) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 10000) req.destroy();
  });
  req.on('end', () => {
    try {
      done(JSON.parse(body));
    } catch {
      done(null);
    }
  });
}

// Subpastas visíveis de um diretório para o seletor de Workspace do widget
// No Windows, subir da raiz do disco mostra as unidades (C:\, D:\, etc.)
const drivesPath = 'Unidades';

function listDrives(res) {
  const dirs = 'CDEFGHIJKLMNOPQRSTUVWXYZ'
    .split('')
    .map((letter) => ({ name: `${letter}:\\`, path: `${letter}:\\` }))
    .filter((drive) => isFolder(drive.path));
  sendJson(res, 200, { current: drivesPath, parent: null, dirs });
}

function listDirs(dir, res) {
  const windows = process.platform === 'win32';
  if (windows && dir === drivesPath) return listDrives(res);

  const current = path.resolve(dir || workspaceRoot || os.homedir());
  try {
    const dirs = visibleDirs(current).map((name) => ({ name, path: path.join(current, name) }));
    let parent = path.dirname(current);
    if (parent === current) parent = windows ? drivesPath : null;
    sendJson(res, 200, { current, parent, dirs });
  } catch {
    sendJson(res, 400, { error: 'Não foi possível abrir esta pasta' });
  }
}

function visibleDirs(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

// Pastas da raiz do Workspace que podem virar projeto (o nome é o que a API aceita como pasta)
function workspaceFolders() {
  if (!workspaceRoot) return [];
  try {
    return visibleDirs(workspaceRoot).filter((name) => /^[\w.-]+$/.test(name));
  } catch {
    return [];
  }
}

// Cria ou atualiza no DeskReport um projeto para cada pasta do Workspace
async function syncProjects(res) {
  const folders = workspaceFolders();
  if (folders.length === 0) return sendJson(res, 400, { error: 'Nenhuma pasta no Workspace para sincronizar' });

  try {
    await mcpApi('POST', '/agents/mcp/projects/sync', { folders });
    console.log(`${folders.length} pastas sincronizadas como projetos`);
    sendJson(res, 200, { folders });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

function isFolder(dir) {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function changeWorkspace(req, res) {
  readJsonBody(req, (data) => {
    const root = typeof data?.workspaceRoot === 'string' && data.workspaceRoot ? path.resolve(data.workspaceRoot) : '';
    if (!root || !isFolder(root)) return sendJson(res, 400, { error: 'Pasta não encontrada' });

    saveConfig({ workspaceRoot: root });
    workspaceRoot = root;
    console.log(`Workspace trocado para ${root}`);
    sendJson(res, 200, { workspaceRoot: root });
    broadcast();
  });
}

function changeAgents(req, res) {
  readJsonBody(req, (data) => {
    if (!Array.isArray(data?.enabledAgents)) return sendJson(res, 400, { error: 'Envie enabledAgents' });

    enabledAgents = agentNames.filter((agent) => data.enabledAgents.includes(agent));
    saveConfig({ enabledAgents });
    syncMcpConfig(enabledAgents);
    if (socket?.connected) socket.emit('machine:agents', { agents: enabledAgents });
    console.log(`Agentes ativos: ${enabledAgents.join(', ') || 'nenhum'}`);
    sendJson(res, 200, { enabledAgents });
    broadcast();
  });
}

function changeRoles(req, res) {
  readJsonBody(req, (data) => {
    if (!data?.roles || typeof data.roles !== 'object') return sendJson(res, 400, { error: 'Envie roles' });

    const agentRoles = {};
    for (const agent of agentNames) {
      const roles = data.roles[agent];
      agentRoles[agent] = Array.isArray(roles) ? roleNames.filter((role) => roles.includes(role)) : [];
    }
    config.agentRoles = agentRoles;
    saveConfig({ agentRoles });

    let files;
    try {
      files = syncInstructionFiles();
    } catch (error) {
      console.log(`Falha ao atualizar as instruções dos agentes: ${error.message}`);
      return sendJson(res, 500, { error: 'Não consegui gravar os arquivos de instrução dos agentes' });
    }
    if (socket?.connected) socket.emit('machine:roles-updated', { roles: agentRoles });
    sendJson(res, 200, { agentRoles, files });
    broadcast();
  });
}

// Bloco de cargos que vai entre os marcadores nos arquivos de instrução globais
function rolesMarkdown() {
  const agents = enabledAgents.filter((agent) => config.agentRoles[agent]?.length);
  const items = agents.map((agent, index) => {
    const roles = config.agentRoles[agent].map((role) => `   - ${roleCatalog[role][0]}: ${roleCatalog[role][1]}`);
    return `${index + 1}. **${agentLabels[agent]}**:\n${roles.join('\n')}`;
  });

  return [
    rolesStart,
    '# Divisão de Papéis e Cargos Desta Máquina',
    '',
    'Nesta máquina os agentes possuem as seguintes atribuições configuradas via DeskReport:',
    '',
    items.join('\n\n') || 'Nenhum cargo configurado.',
    rolesEnd,
  ].join('\n');
}

// Troca só o bloco entre os marcadores e preserva o resto do arquivo.
// Sem marcadores o bloco entra no topo. Symlinks para o mesmo arquivo são gravados uma vez só
function syncInstructionFiles() {
  const block = rolesMarkdown();
  const written = [];

  for (const agent of enabledAgents) {
    const file = instructionFiles[agent];
    if (!file) continue;
    const target = existsSync(file) ? realpathSync(file) : file;
    if (written.includes(target)) continue;

    const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
    const start = current.indexOf(rolesStart);
    const end = current.indexOf(rolesEnd);
    let next;
    if (start >= 0 && end > start) next = current.slice(0, start) + block + current.slice(end + rolesEnd.length);
    else next = current ? `${block}\n\n${current}` : `${block}\n`;

    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, next);
    written.push(target);
    console.log(`Cargos dos agentes atualizados em ${target}`);
  }
  return written;
}

function changePreferences(req, res) {
  readJsonBody(req, (data) => {
    if (typeof data?.alerts === 'boolean') {
      config.alerts = data.alerts;
      saveConfig({ alerts: data.alerts });
    }
    if (typeof data?.autostart === 'boolean') {
      try {
        setAutostart(data.autostart);
      } catch (error) {
        console.log(`Falha ao configurar o início com o sistema: ${error.message}`);
        return sendJson(res, 500, { error: 'Não consegui configurar o início com o sistema' });
      }
    }
    sendJson(res, 200, { alerts: config.alerts, autostart: autostartOn() });
    broadcast();
  });
}

// Encerrar com agente rodando deixaria a tarefa sem resposta no painel
function quit(res) {
  if (Object.keys(running).length > 0) return sendJson(res, 409, { error: 'Há tarefas em execução. Pare as tarefas antes de encerrar' });
  sendJson(res, 200, { ok: true });
  console.log('Encerrado pelo widget');
  setTimeout(() => process.exit(0), 200);
}

// Cada sistema tem seu jeito de abrir programas no login. Todos rodam o client com o node atual
function autostartFile() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'LaunchAgents', 'br.com.deskreport.client.plist');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'DeskReport.vbs');
  return path.join(os.homedir(), '.config', 'autostart', 'deskreport.desktop');
}

function autostartOn() {
  return existsSync(autostartFile());
}

function setAutostart(on) {
  const file = autostartFile();
  if (!on) {
    rmSync(file, { force: true });
    return;
  }

  let content = `[Desktop Entry]
Type=Application
Name=DeskReport
Comment=Agentes do DeskReport em segundo plano
Exec="${process.execPath}" "${clientScript}" start --background
Terminal=false
X-GNOME-Autostart-enabled=true
`;
  // O launchd encerra os filhos quando o processo principal sai, então no macOS o client roda direto
  if (process.platform === 'darwin') {
    content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>br.com.deskreport.client</string>
  <key>ProgramArguments</key>
  <array><string>${process.execPath}</string><string>${clientScript}</string><string>start</string></array>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${logPath}</string>
  <key>StandardErrorPath</key><string>${logPath}</string>
</dict>
</plist>
`;
  }
  // O .vbs roda sem abrir janela de terminal
  if (process.platform === 'win32') {
    content = `CreateObject("WScript.Shell").Run """${process.execPath}"" ""${clientScript}"" start --background", 0, False\r\n`;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function startAuth(res) {
  sendJson(res, 202, { started: true });
  if (authPending) return;

  authPending = true;
  broadcast();
  authorize(workspaceRoot).then((ok) => {
    authPending = false;
    if (ok) connectSocket();
    broadcast();
  });
}

function widgetState() {
  return {
    connected: Boolean(socket?.connected),
    hasToken: Boolean(config.machineToken),
    authPending,
    alertsOn: config.alerts,
    autostart: autostartOn(),
    webUrl: config.webUrl,
    busy: Object.keys(running).length > 0,
    organizationName: config.organizationName || '',
    workspaceRoot,
    workspaceName: path.basename(workspaceRoot) || workspaceRoot,
    agents: enabledAgents.map((agent) => ({
      agent,
      name: agentLabels[agent],
      task: running[agent]?.title || '',
      model: config.models?.[agent] || '',
      quota: quotas[agent] ? Math.round(quotas[agent].used * 100) : null,
      ...agents[agent],
    })),
    catalog: agentNames.map((agent) => ({
      agent,
      name: agentLabels[agent],
      detected: detectedAgents.includes(agent),
      enabled: enabledAgents.includes(agent),
      roles: config.agentRoles[agent] || [],
    })),
    roleCatalog: roleNames.map((role) => ({ role, name: roleCatalog[role][0], description: roleCatalog[role][1] })),
    logs,
  };
}

function broadcast() {
  const message = `data: ${JSON.stringify(widgetState())}\n\n`;
  for (const client of widgetClients) client.write(message);
}

// O alerta de cota vai junto em toda telemetria para não sumir do painel enquanto o agente trabalha
function sendTelemetry(status) {
  const alert = alerts[status?.agent];
  const data = { ...status, alert: alert?.message, quotaLevel: alert?.level };
  if (agents[data.agent]) {
    agents[data.agent] = { state: data.state, project: data.project, action: data.action, alert: data.alert, quotaLevel: data.quotaLevel };
    if (data.action) logs = [...logs.slice(-19), { agent: data.agent, action: String(data.action).slice(0, 180), at: new Date().toISOString() }];
    broadcast();
  }
  if (socket?.connected) socket.emit('machine:telemetry', data);
}

function cleanSummary(raw) {
  if (!raw) return '';
  const marker = raw.lastIndexOf('--- RESUMO DA ENTREGA ---');
  const base = marker >= 0 ? raw.slice(marker + 25) : raw;

  const lines = base.split('\n');
  const filtered = [];
  let skippingCommand = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (filtered.length > 0 && filtered[filtered.length - 1] !== '') filtered.push('');
      continue;
    }

    if (trimmed.startsWith('$ ') || trimmed.startsWith('> ')) {
      skippingCommand = true;
      continue;
    }

    if (
      trimmed.startsWith('exit=') ||
      trimmed === '(no output)' ||
      /^Parei com código \d+/i.test(trimmed) ||
      /^\d+:\s*/.test(trimmed) ||
      /^\d+-\s*/.test(trimmed) ||
      /\|\s*\d+\s*[+-]+$/.test(trimmed) ||
      /^\d+\s+files?\s+changed/i.test(trimmed) ||
      /^\(?node:\d+\)?/i.test(trimmed)
    ) {
      continue;
    }

    if (/^[A-ZÁÉÍÓÚÀÂÊÔÃÕ].*/.test(trimmed) || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      skippingCommand = false;
    }

    if (!skippingCommand) {
      filtered.push(trimmed);
    }
  }

  return filtered.join('\n').trim();
}

function finish(task, exitCode, summary, touchedFiles = [], stopped = false) {
  delete running[task.agent];
  saveState();
  socket.emit('machine:task-finished', { taskId: task.taskId, agent: task.agent, mode: task.mode, exitCode, summary, touchedFiles, stopped, tokens: task.tokens });
  notify(`${agentLabels[task.agent]} ${exitCode === 0 ? 'terminou' : 'parou'}: ${task.title}`);
  agents[task.agent] = { state: 'idle', action: exitCode === 0 ? 'Concluído' : `Parou com código ${exitCode}` };
  broadcast();
  startNext(task.agent);
}

function enqueueTask(task) {
  const problem = quotaProblem(task.agent);
  if (running[task.agent] || problem) {
    queues[task.agent] = queues[task.agent] || [];
    queues[task.agent].push(task);
    saveState();
    const blocked = problem && !running[task.agent];
    const action = blocked ? `Pausado por cota. Na fila: ${task.title}` : `Na fila: ${task.title}`;
    sendTelemetry({ agent: task.agent, state: blocked ? 'paused' : 'working', project: task.projectPath || task.project, action, taskId: task.taskId });
    return;
  }
  runTask(task);
}

// Botão Parar Execução do painel: mata o agente da tarefa ou tira ela da fila
function stopTask(data) {
  const taskId = data?.taskId;
  if (stoppers[taskId]) return stoppers[taskId]();

  for (const agent of agentNames) {
    const task = queues[agent]?.find((item) => item.taskId === taskId);
    if (!task) continue;
    queues[agent] = queues[agent].filter((item) => item !== task);
    saveState();
    socket.emit('machine:task-finished', { taskId, agent, mode: task.mode, exitCode: 1, summary: 'Tirada da fila antes de começar.', stopped: true });
  }
}

function startNext(agent) {
  if (running[agent]) return;
  const problem = quotaProblem(agent);
  if (problem) {
    sendTelemetry({ agent, state: 'paused', action: `Pausado por cota. ${queues[agent]?.length || 0} na fila` });
    return;
  }
  const next = queues[agent]?.shift();
  if (next) runTask(next);
}

// Alerta que trava o agente, ou null quando ele pode trabalhar. O aviso de 60% restante não trava
function quotaProblem(agent) {
  const alert = alerts[agent];
  return alert && alert.level !== 'warn' ? alert.message : null;
}

// Avisa com som no sistema e no painel a cada degrau. stop e block travam o agente até liberar ou trocar o modelo
function raiseAlert(agent, level, message) {
  if (alertLevels.indexOf(level) <= alertLevels.indexOf(alerts[agent]?.level)) return;
  alerts[agent] = { level, message };
  saveState();
  notify(message, true);
  const action = level === 'block' ? 'Bloqueado pela cota' : level === 'stop' ? 'Esperando autorização' : 'Aviso de cota';
  sendTelemetry({ agent, state: level === 'warn' ? (running[agent] ? 'working' : 'idle') : 'paused', action });
}

// Janela da cota renovou: o alerta cai sozinho e a fila volta a andar
function releaseRenewedQuotas() {
  for (const agent of agentNames) {
    if (!(quotas[agent]?.resetsAt < Date.now())) continue;
    delete quotas[agent];
    delete alerts[agent];
    saveState();
    sendTelemetry({ agent, state: running[agent] ? 'working' : 'idle', action: 'Cota renovada' });
    startNext(agent);
  }
}

// "Continuar mesmo assim": vale até a janela da cota renovar. Bloqueio obrigatório só sai trocando o modelo
function continueAgent(agent) {
  if (alerts[agent]?.level !== 'stop') return false;
  delete alerts[agent];
  if (quotas[agent]) quotas[agent].approved = 'stop';
  saveState();
  console.log(`${agentLabels[agent]} autorizado a continuar acima da margem de cota`);
  sendTelemetry({ agent, state: running[agent] ? 'working' : 'idle', action: 'Autorizado a continuar' });
  startNext(agent);
  return true;
}

// Trocar o modelo vale como autorização: tira a pausa e retoma a fila. Salvar o mesmo só libera a pausa de 40% restante
function changeModel(req, res) {
  readJsonBody(req, (data) => {
    if (!agentLabels[data?.agent] || typeof data.model !== 'string') return sendJson(res, 400, { error: 'Envie agent e model' });

    const model = data.model.trim();
    if (alerts[data.agent]?.level === 'block' && model === (config.models?.[data.agent] || '')) {
      return sendJson(res, 400, { error: 'Bloqueio obrigatório: troque o modelo ou espere a cota renovar' });
    }
    const models = { ...config.models, [data.agent]: model };
    config.models = models;
    saveConfig({ models });
    // Libera só o degrau que estava travando, os próximos continuam valendo
    const level = alerts[data.agent]?.level;
    if (level === 'stop' || level === 'block') {
      delete alerts[data.agent];
      if (quotas[data.agent]) quotas[data.agent].approved = level;
      saveState();
    }
    sendJson(res, 200, { models });
    sendTelemetry({ agent: data.agent, state: running[data.agent] ? 'working' : 'idle', action: `Modelo: ${models[data.agent] || 'padrão'}` });
    startNext(data.agent);
  });
}

// Com stream, o Claude Code devolve eventos em JSON, inclusive o uso da cota
// Com session (Chat Lateral) o Antigravity e o Claude Code respondem em JSON, que traz o id da conversa para retomar na próxima mensagem
function agentCommand(agent, prompt, stream = false, session) {
  const model = config.models?.[agent] ? ['--model', config.models[agent]] : [];
  const json = session ? ['--output-format', 'json'] : [];
  if (agent === 'antigravity') {
    const resume = session?.externalId ? ['--conversation', session.externalId] : [];
    return ['agy', ['--dangerously-skip-permissions', ...resume, ...json, ...model, '-p', prompt]];
  }
  if (agent === 'opencode') return ['opencode', ['run', '--auto', ...model, prompt]];
  if (agent === 'codex') return ['codex', ['exec', '--full-auto', ...model, prompt]];
  if (agent === 'gemini') return ['gemini', ['--yolo', ...model, '-p', prompt]];
  if (agent === 'aider') return ['aider', ['--yes-always', ...model, '--message', prompt]];
  const output = stream ? ['--output-format', 'stream-json', '--verbose'] : json;
  const resume = session?.externalId ? ['--resume', session.externalId] : [];
  return ['claude', ['--permission-mode', 'bypassPermissions', ...resume, ...output, ...model, '-p', prompt]];
}

// PATH usado para achar e rodar os agentes, incluindo onde os instaladores costumam colocar os binários
function agentPath() {
  const home = os.homedir();
  return [path.dirname(process.execPath), `${home}/.local/bin`, `${home}/.opencode/bin`, `${home}/.gemini/antigravity-cli/bin`, '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH || ''].join(path.delimiter);
}

function detectAgents() {
  const dirs = agentPath().split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  return agentNames.filter((agent) =>
    dirs.some((dir) => extensions.some((ext) => isFile(path.join(dir, agentBins[agent] + ext)))),
  );
}

// O cmd.exe corta o comando na quebra de linha e não aceita aspas dentro de aspas
function windowsArg(arg) {
  return `"${arg.replace(/\r?\n/g, ' ').replace(/"/g, "'")}"`;
}

function isFile(file) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

async function runTask(task) {
  const folder = task.projectPath || task.project;
  const cwd = path.resolve(workspaceRoot, folder || '');

  if (!agentLabels[task.agent]) return;
  if (!workspaceRoot) {
    finish(task, 1, 'Nenhuma pasta de Workspace escolhida no widget do DeskReport');
    return;
  }
  if (!cwd.startsWith(workspaceRoot + path.sep) || !existsSync(cwd)) {
    finish(task, 1, `Pasta ${folder} não existe dentro de ${workspaceRoot}`);
    return;
  }

  console.log(`Rodando ${task.agent} em ${cwd} para a tarefa ${task.taskId}`);
  running[task.agent] = task;
  saveState();
  notify(`${agentLabels[task.agent]} começou: ${task.title}`);
  sendTelemetry({ agent: task.agent, state: 'working', project: path.basename(cwd), action: `Iniciando: ${task.title}`, taskId: task.taskId });

  await downloadAttachments(task);

  const stream = task.agent === 'claude';
  const [bin, child] = startAgent(task.agent, buildPrompt(task, cwd), cwd, { DESKREPORT_TASK_ID: task.taskId }, stream);

  let output = '';
  let stopReason = '';
  let stoppedByUser = false;
  let requeue = false;
  let killTimer;
  function stop(reason) {
    if (stopReason) return;
    stopReason = reason;
    child.kill('SIGTERM');
    killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
  }
  stoppers[task.taskId] = () => {
    stoppedByUser = true;
    stop('Parado pelo usuário');
  };
  // Parada por cota não conta como falha: a tarefa volta para o começo da fila com o progresso e roda de novo após a autorização
  function stopForQuota(level, alert) {
    requeue = true;
    task.resumed = true;
    task.progress = output.trim().slice(-1500);
    raiseAlert(task.agent, level, alert);
    stop('Cota');
  }
  const timer = setTimeout(() => stop(`Passou de ${TASK_TIMEOUT_MS / 60_000} min sem terminar`), TASK_TIMEOUT_MS);

  function show(text) {
    output = (output + text).slice(-4000);
    sendOutput(text);
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    for (const line of lines.slice(-3)) {
      sendTelemetry({ agent: task.agent, state: 'working', project: path.basename(cwd), action: line.slice(0, 180), taskId: task.taskId, tokens: task.tokens });
    }
  }

  // Terminal ao vivo do painel
  function sendOutput(text) {
    if (socket?.connected) socket.emit('machine:task-output', { taskId: task.taskId, agent: task.agent, text });
  }

  // Tokens novos de cada mensagem (entrada, saída e cache criado). Leitura de cache fica de fora
  const startTokens = task.tokens || 0;
  const usageByMessage = {};
  function countTokens(id, usage) {
    if (!usage) return;
    usageByMessage[id] = newTokens(usage);
    task.tokens = startTokens + Object.values(usageByMessage).reduce((sum, value) => sum + value, 0);
  }

  function onChunk(chunk) {
    const text = chunk.toString().replace(/\x1b\[[0-9;]*m/g, '');
    show(text);
    if (!stream && LIMIT_PATTERN.test(text)) stopForQuota('stop', limitAlert(task.agent));
  }

  // Eventos do Claude Code: texto da resposta, resultado final e uso da cota
  let pending = '';
  function onEvents(chunk) {
    pending += chunk.toString();
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const line of lines) {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type === 'assistant') {
        countTokens(event.message?.id, event.message?.usage);
        const content = event.message?.content || [];
        const text = content.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
        if (text) show(`${text}\n`);
        for (const tool of content.filter((part) => part.type === 'tool_use')) {
          const input = tool.input || {};
          sendOutput(`> ${tool.name} ${input.command || input.file_path || input.pattern || ''}\n`);
        }
      }
      if (event.type === 'result') {
        // O resultado traz o total certo da execução
        if (event.usage) task.tokens = startTokens + newTokens(event.usage);
        if (event.result) output = String(event.result).slice(-4000);
      }
      if (event.type === 'rate_limit_event') readQuota(task.agent, event.rate_limit_info, stopForQuota);
    }
  }

  child.stdout.on('data', stream ? onEvents : onChunk);
  child.stderr.on('data', onChunk);

  child.on('error', (error) => {
    clearTimeout(timer);
    delete stoppers[task.taskId];
    finish(task, 1, `Não foi possível rodar ${bin}: ${error.message}`);
  });
  child.on('close', (code) => {
    clearTimeout(timer);
    clearTimeout(killTimer);
    delete stoppers[task.taskId];
    if (running[task.agent] !== task) return;
    if (requeue) {
      delete running[task.agent];
      queues[task.agent] = [task, ...(queues[task.agent] || [])];
      saveState();
      startNext(task.agent);
      return;
    }
    const summary = cleanSummary([stopReason, output.trim()].filter(Boolean).join('\n\n'));
    execFile('git', ['status', '-s', '--', '.'], { cwd }, (error, stdout) => {
      const touchedFiles = error ? [] : stdout.split('\n').map((line) => line.trim()).filter(Boolean);
      // Parada pelo usuário nunca conta como sucesso, mesmo se o agente sair com 0
      finish(task, stoppedByUser ? 1 : code ?? 1, summary.slice(-3000), touchedFiles, stoppedByUser);
    });
  });
}

// Guarda a janela mais usada (5 horas ou semana) e alerta de 20 em 20% restante. A pausa e o bloqueio param a tarefa na hora
function readQuota(agent, info, stopForQuota) {
  if (!info) return;
  const windows = Object.values(info.unifiedWindows || {});
  if (!windows.length) return;
  const top = windows.reduce((max, window) => (window.utilization > max.utilization ? window : max));
  const resetsAt = top.resetsAt * 1000;
  // A autorização vale só para a janela atual da cota
  const approved = quotas[agent]?.resetsAt === resetsAt ? quotas[agent].approved : '';
  quotas[agent] = { used: top.utilization, resetsAt, approved };
  saveState();
  broadcast();

  const name = agentLabels[agent];
  if (info.status === 'rejected' || (top.utilization >= QUOTA_BLOCK && approved !== 'block')) {
    return stopForQuota('block', `Bloqueio de Cota: restam 20% ou menos para ${name}. Troque o modelo ou espere a cota renovar.`);
  }
  if (approved) return;
  if (top.utilization >= QUOTA_STOP) {
    return stopForQuota('stop', `Alerta de Cota: Margem de segurança de 40% atingida para ${name}. Confirma continuar?`);
  }
  if (top.utilization >= QUOTA_WARN) raiseAlert(agent, 'warn', `Aviso de Cota: restam 60% para ${name}.`);
}

// Fila, tarefa em andamento, cota e alertas ficam no disco para retomar quando o client reiniciar
function saveState() {
  const tasks = { running: Object.values(running), queues, quotas, alerts };
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  writeFileSync(statePath, JSON.stringify(tasks), { mode: 0o600 });
}

// Tarefa que estava rodando volta na frente da fila e retoma de onde parou
function loadState() {
  const saved = readJson(statePath);
  Object.assign(quotas, saved.quotas);
  Object.assign(alerts, saved.alerts);
  for (const agent of agentNames) {
    const current = (saved.running || []).filter((task) => task.agent === agent).map((task) => ({ ...task, resumed: true }));
    const list = [...current, ...(saved.queues?.[agent] || [])];
    if (list.length) queues[agent] = list;
  }
}

function newTokens(usage) {
  return (usage.input_tokens || 0) + (usage.output_tokens || 0) + (usage.cache_creation_input_tokens || 0);
}

function limitAlert(agent) {
  return `Alerta de Cota: o provedor avisou limite de cota para ${agentLabels[agent]}. Confirma continuar?`;
}

// Abre o agente sem os segredos do client no ambiente
function startAgent(agent, prompt, cwd, env = {}, stream = false, session) {
  const [bin, args] = agentCommand(agent, prompt, stream, session);
  const windows = process.platform === 'win32';

  const childEnv = { ...process.env };
  delete childEnv.DATABASE_URL;
  delete childEnv.PORT;
  delete childEnv.BETTER_AUTH_URL;
  delete childEnv.BETTER_AUTH_SECRET;
  delete childEnv.DESKREPORT_MACHINE_TOKEN;
  delete childEnv.DESKREPORT_DEV_TOKEN;

  // No Windows os agentes instalados pelo npm são .cmd e só rodam pelo shell, então cada argumento vai entre aspas
  const child = spawn(bin, windows ? args.map(windowsArg) : args, {
    cwd,
    shell: windows,
    env: { ...childEnv, ...env, PATH: agentPath() },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return [bin, child];
}

// Mensagem do Chat Lateral: cada sessão do painel é uma conversa da CLI. Sessão nova começa com o contexto limpo
function runChat(chat) {
  if (!enabledAgents.includes(chat.agent)) return;

  function reply(content, externalId) {
    socket.emit('machine:chat-reply', { agent: chat.agent, ownerId: chat.ownerId, sessionId: chat.sessionId, externalId, content });
  }

  const problem = quotaProblem(chat.agent);
  if (problem) return reply(`Estou pausado. ${problem}`);
  const cwd = path.resolve(workspaceRoot || '', chat.projectPath || '');
  if (!workspaceRoot) return reply('Nenhuma pasta de Workspace escolhida no widget do DeskReport.');
  if ((cwd !== workspaceRoot && !cwd.startsWith(workspaceRoot + path.sep)) || !existsSync(cwd)) {
    return reply(`Pasta ${chat.projectPath} não existe dentro de ${workspaceRoot}.`);
  }

  // Conversa retomada pela CLI já tem o histórico, só o OpenCode e os demais recebem a conversa no prompt
  const resumable = chat.agent === 'claude' || chat.agent === 'antigravity';
  const resumed = resumable && chat.externalId;
  const history = resumed ? '' : (chat.history || []).map((m) => `${m.author}: ${m.content}`).join('\n');
  const prompt = [
    'Você está no Chat Lateral do DeskReport conversando com um membro do time.',
    history ? `Conversa até agora:\n${history}` : '',
    `Última mensagem: ${chat.content}`,
    [
      'Responda em português, direto e curto. Esse texto aparece no chat assinado por você.',
      'Se pedirem para criar, consultar ou atualizar tarefas e projetos, use as ferramentas do MCP deskreport.',
      'Se pedirem alteração de código, faça nesta pasta e resuma o que mudou. Se for só dúvida ou alinhamento, apenas responda sem tocar nos arquivos.',
    ].join('\n'),
  ].filter(Boolean).join('\n\n');

  console.log(`Chat com ${chat.agent} em ${cwd}`);
  const session = resumable ? { externalId: chat.externalId } : undefined;
  const [bin, child] = startAgent(chat.agent, prompt, cwd, {}, false, session);
  let output = '';
  child.stdout.on('data', (chunk) => { output = (output + chunk.toString().replace(/\x1b\[[0-9;]*m/g, '')).slice(-200000); });
  child.on('error', (error) => reply(`Não foi possível rodar ${bin}: ${error.message}`));
  child.on('close', (code) => {
    const fallback = `Parei com código ${code ?? 1} sem resposta.`;
    if (!session) return reply(output.trim() || fallback);
    // agy devolve conversation_id e response, o Claude Code devolve session_id e result
    try {
      const data = JSON.parse(output);
      reply(String(data.response ?? data.result ?? '').trim() || fallback, data.conversation_id || data.session_id);
    } catch {
      reply(output.trim().slice(-10000) || fallback);
    }
  });
}

// Outro agente chamou este pela sala do time: roda com o histórico e a resposta volta para quem chamou
function runTeamMessage(msg) {
  if (!enabledAgents.includes(msg.to) || !socket) return;

  function reply(content) {
    socket.emit('machine:team-reply', { agent: msg.to, toAgent: msg.from, taskId: msg.taskId, message: content });
  }

  const problem = quotaProblem(msg.to);
  if (problem) return reply(`Estou pausado. ${problem}`);
  const cwd = path.resolve(workspaceRoot || '', msg.projectPath || '');
  if (!workspaceRoot || (cwd !== workspaceRoot && !cwd.startsWith(workspaceRoot + path.sep)) || !existsSync(cwd)) {
    return reply('Não achei a pasta do projeto no Workspace desta máquina.');
  }

  const history = (msg.history || []).map((m) => `${m.author}: ${m.content}`).join('\n');
  const prompt = [
    `Você está na sala do time do DeskReport e ${agentLabels[msg.from]} mandou uma mensagem para você.`,
    history ? `Conversa até agora:\n${history}` : '',
    `Mensagem de ${agentLabels[msg.from]}: ${msg.content}`,
    msg.taskId ? `Tarefa relacionada: ${msg.taskId} (use deskreport_get_task se precisar dos detalhes).` : '',
    [
      'Responda em português, direto e curto. Sua resposta volta automaticamente para quem perguntou.',
      'Não use deskreport_send_agent_message para responder esta mensagem.',
      'Só altere arquivos se o pedido exigir, e resuma o que mudou.',
    ].join('\n'),
  ].filter(Boolean).join('\n\n');

  console.log(`${msg.from} chamou ${msg.to} na sala do time`);
  const [bin, child] = startAgent(msg.to, prompt, cwd);
  let output = '';
  child.stdout.on('data', (chunk) => { output = (output + chunk.toString().replace(/\x1b\[[0-9;]*m/g, '')).slice(-10000); });
  child.on('error', (error) => reply(`Não foi possível rodar ${bin}: ${error.message}`));
  child.on('close', (code) => reply(output.trim() || `Parei com código ${code ?? 1} sem resposta.`));
}

// Baixa os anexos da tarefa para a pasta do client, fora do repositório, e guarda o caminho local de cada um
async function downloadAttachments(task) {
  const dir = path.join(configDir, 'attachments', String(task.taskId).replace(/[^\w-]/g, '_'));
  for (const attachment of task.attachments || []) {
    try {
      const res = await fetch(`${config.apiUrl}/agents/mcp/tasks/${encodeURIComponent(task.taskId)}/attachments/${encodeURIComponent(attachment.id)}/download`, {
        headers: { Authorization: `Bearer ${config.machineToken}` },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, path.basename(attachment.filename));
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      attachment.localPath = file;
    } catch (error) {
      console.log(`Não consegui baixar o anexo ${attachment.filename}: ${error.message}`);
    }
  }
}

function attachmentsNote(task) {
  const attachments = task.attachments || [];
  if (attachments.length === 0) return '';
  const lines = attachments.map((a) => `- ${a.filename} (${a.localPath ? `arquivo: ${a.localPath}` : 'não foi possível baixar'})`);
  return [
    'Anexos da tarefa:',
    ...lines,
    'Leia os anexos antes de começar. Specs em Markdown e textos descrevem o que deve ser feito, imagens mostram telas ou erros e patches ou logs trazem o contexto técnico.',
  ].join('\n');
}

function plainText(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Tarefa interrompida (cota ou client reiniciado) volta com o aviso e o último progresso
function buildPrompt(task, cwd) {
  const prompt = [taskPrompt(task), gitContext(cwd)].filter(Boolean).join('\n\n');
  if (!task.resumed) return prompt;
  return [
    prompt,
    'Esta tarefa foi interrompida antes de terminar. Rode git status e git diff nesta pasta para ver o que já foi feito e continue de onde parou.',
    task.progress ? `Últimas saídas antes da parada:\n${task.progress}` : '',
  ].filter(Boolean).join('\n\n');
}

// Ponto em que o repositório está antes do agente começar: arquivos pendentes e últimos commits
function gitContext(cwd) {
  try {
    const status = execFileSync('git', ['status', '-s'], { cwd, encoding: 'utf8', timeout: 10_000 }).trim();
    const log = execFileSync('git', ['log', '-n', '3', '--oneline'], { cwd, encoding: 'utf8', timeout: 10_000 }).trim();
    return [
      'Estado atual do repositório:',
      `git status -s:\n${status.slice(0, 3000) || '(sem alterações pendentes)'}`,
      `git log -n 3 --oneline:\n${log}`,
    ].join('\n');
  } catch {
    return '';
  }
}

function taskPrompt(task) {
  const description = plainText(task.description || '');
  // Todos os comentários anteriores, de pessoas e de agentes, para continuar o trabalho do time
  const comments = (task.comments || []).map(plainText).filter(Boolean);
  const notes = comments.length > 0 ? `Comentários anteriores na tarefa:\n- ${comments.join('\n- ')}` : '';

  if (task.mode === 'comment') {
    return [
      `Tarefa do DeskReport: ${task.title}`,
      description,
      attachmentsNote(task),
      notes,
      `Novo comentário para você: ${plainText(task.comment || '')}`,
      [
        'Avalie o pedido do comentário antes de agir.',
        'Se ele pedir implementação, correção, ajuste ou execução, faça a alteração no código desta pasta e responda com um resumo curto do que foi feito.',
        'Se for só uma pergunta, alinhamento ou revisão que não exige alterar código, apenas responda diretamente sem tocar nos arquivos.',
        'Responda em português. Esse texto vira a sua resposta no comentário da tarefa.',
      ].join('\n'),
    ].filter(Boolean).join('\n\n');
  }

  if (task.agent === 'antigravity') {
    return [
      `Code Review da tarefa do DeskReport: ${task.title}`,
      description,
      attachmentsNote(task),
      notes,
      [
        'Você é o revisor do time. Rode `git status -s -- .` e `git diff` nesta pasta e revise as alterações.',
        'Valide se o código atende a descrição da tarefa e os comentários acima.',
        'Confira as regras globais: nenhum travessão, nenhum Set do JavaScript, isolamento multi-tenant em toda query e rota (companyId ou organizationId), sem segredos em log ou resposta, e código simples sem camadas a mais.',
        'Não altere arquivos e não faça commit.',
        'Responda em português com um parecer objetivo: aprovado ou não, e a lista de problemas com arquivo e linha. Esse texto vira o comentário da tarefa.',
      ].join('\n'),
    ].filter(Boolean).join('\n\n');
  }

  return [
    `Tarefa do DeskReport: ${task.title}`,
    description,
    attachmentsNote(task),
    notes,
    [
      'Ao finalizar a tarefa, responda no final apenas com um comentário claro e direto em português do que foi feito e da regra de negócio ajustada.',
      'Nunca inclua no resumo final saídas de comandos (como $ cd, npx tsc, git diff, head), logs de terminal nem trechos longos de código.',
      'Se algo não foi feito ou apresentou problema, termine com uma seção Impedimentos explicando o motivo.',
      'Esse resumo final será o comentário publicado na tarefa.',
    ].join('\n'),
  ].filter(Boolean).join('\n\n');
}

// Registra o MCP deskreport nos agentes habilitados e tira dos desabilitados
// Arquivo que não é JSON puro (com comentários, por exemplo) fica intocado
function syncMcpConfig(enabled) {
  const home = os.homedir();
  const files = [
    { agent: 'claude', file: path.join(home, '.claude.json'), key: 'mcpServers' },
    { agent: 'antigravity', file: path.join(home, '.gemini', 'antigravity-cli', 'mcp_config.json'), key: 'mcpServers' },
    { agent: 'gemini', file: path.join(home, '.gemini', 'settings.json'), key: 'mcpServers' },
    { agent: 'opencode', file: path.join(home, '.config', 'opencode', 'opencode.json'), key: 'mcp' },
  ];

  for (const { agent, file, key } of files) {
    const on = enabled.includes(agent);
    if (!on && !existsSync(file)) continue;

    let data = {};
    if (existsSync(file)) {
      try {
        data = JSON.parse(readFileSync(file, 'utf8'));
      } catch {
        console.log(`Não registrei o MCP em ${file}: o arquivo não é JSON puro`);
        continue;
      }
    }

    const before = JSON.stringify(data);
    const servers = { ...data[key] };
    if (on) servers.deskreport = mcpEntry(agent);
    else delete servers.deskreport;
    data[key] = servers;
    if (JSON.stringify(data) === before) continue;

    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
    console.log(`MCP deskreport ${on ? 'registrado' : 'removido'} em ${file}`);
  }
}

function mcpEntry(agent) {
  const args = [clientScript, 'mcp', '--agent', agent];
  if (agent === 'opencode') return { type: 'local', command: [process.execPath, ...args], enabled: true };
  if (agent === 'claude') return { type: 'stdio', command: process.execPath, args };
  return { command: process.execPath, args };
}

// Servidor MCP sobre stdio (JSON-RPC 2.0, uma mensagem por linha)
// O stdout é do protocolo, então nada de console.log aqui
async function mcpServer(agent) {
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      mcpReply({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } });
      continue;
    }
    mcpHandle(message, agent).then((reply) => reply && mcpReply(reply));
  }
}

function mcpReply(reply) {
  process.stdout.write(JSON.stringify(reply) + '\n');
}

async function mcpHandle(message, agent) {
  const { id, method, params } = message;
  if (id === undefined) return null;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: params?.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'deskreport', version: '1.0.0' },
      },
    };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: mcpTools } };
  if (method !== 'tools/call') return { jsonrpc: '2.0', id, error: { code: -32601, message: `Método ${method} não existe` } };

  try {
    const data = await callTool(params?.name, params?.arguments || {}, agent);
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] } };
  } catch (error) {
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: error.message }], isError: true } };
  }
}

function schema(properties, required = []) {
  return { type: 'object', properties, required };
}

const taskRef = { type: 'string', description: 'UUID ou número da tarefa (3 ou #003)' };
const statusField = { type: 'string', enum: ['backlog', 'todo', 'in-progress', 'review', 'done', 'release'] };
const priorityField = { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] };
const projectField = { type: 'string', description: 'Id ou nome do projeto' };
const taskFields = {
  title: { type: 'string' },
  description: { type: 'string', description: 'Texto da tarefa, quebras de linha viram parágrafos' },
  project: projectField,
  status: statusField,
  priority: priorityField,
  tags: { type: 'array', items: { type: 'string' } },
  assigneeIds: { type: 'array', items: { type: 'string' }, description: 'Ids de usuários da organização ou nome do agente (claude, opencode...)' },
};

const mcpTools = [
  { name: 'deskreport_list_projects', description: 'Lista os projetos da organização no DeskReport', inputSchema: schema({}) },
  {
    name: 'deskreport_create_project',
    description: 'Cria um projeto no DeskReport',
    inputSchema: schema({ name: { type: 'string' }, description: { type: 'string' } }, ['name']),
  },
  {
    name: 'deskreport_list_tasks',
    description: 'Lista as tarefas da organização (até 100, mais novas primeiro)',
    inputSchema: schema({ status: statusField, project: projectField, priority: priorityField }),
  },
  { name: 'deskreport_get_task', description: 'Mostra uma tarefa com comentários', inputSchema: schema({ task: taskRef }, ['task']) },
  {
    name: 'deskreport_create_task',
    description: 'Cria uma tarefa no DeskReport tendo este agente como autor',
    inputSchema: schema(taskFields, ['title', 'project']),
  },
  {
    name: 'deskreport_update_task',
    description: 'Atualiza campos de uma tarefa',
    inputSchema: schema({ task: taskRef, ...taskFields }, ['task']),
  },
  {
    name: 'deskreport_comment_task',
    description: 'Comenta numa tarefa assinando como este agente',
    inputSchema: schema({ task: taskRef, content: { type: 'string' } }, ['task', 'content']),
  },
  {
    name: 'deskreport_dispatch_task',
    description: 'Manda um agente executar a tarefa na máquina conectada',
    inputSchema: schema(
      {
        task: taskRef,
        agent: { type: 'string', enum: agentNames, description: 'Agente que vai executar' },
        projectPath: { type: 'string', description: 'Nome da pasta do projeto dentro do Workspace' },
      },
      ['task', 'agent'],
    ),
  },
  {
    name: 'deskreport_send_agent_message',
    description: 'Manda mensagem direta para outro agente do time (ele é acionado e responde na sala do time) ou para o canal do time com toAgent team',
    inputSchema: schema(
      {
        toAgent: { type: 'string', enum: [...agentNames, 'team'], description: 'Agente que recebe, ou team para o canal do time' },
        message: { type: 'string' },
        taskId: { ...taskRef, description: 'Tarefa relacionada, opcional' },
      },
      ['toAgent', 'message'],
    ),
  },
  {
    name: 'deskreport_get_team_chat',
    description: 'Mostra o histórico de mensagens entre os agentes na sala do time',
    inputSchema: schema({ taskId: { ...taskRef, description: 'Filtra pela tarefa, opcional' }, limit: { type: 'number', description: 'Até 100, padrão 50' } }),
  },
];

function callTool(name, args, agent) {
  const { task, ...fields } = args;
  const taskPath = `/agents/mcp/tasks/${encodeURIComponent(String(task || ''))}`;

  if (name === 'deskreport_list_projects') return mcpApi('GET', '/agents/mcp/projects');
  if (name === 'deskreport_create_project') return mcpApi('POST', '/agents/mcp/projects', fields);
  if (name === 'deskreport_list_tasks') {
    const query = new URLSearchParams(Object.entries(fields).filter(([, value]) => typeof value === 'string'));
    return mcpApi('GET', `/agents/mcp/tasks?${query}`);
  }
  if (name === 'deskreport_get_task') return mcpApi('GET', taskPath);
  if (name === 'deskreport_create_task') return mcpApi('POST', '/agents/mcp/tasks', { ...fields, agent });
  if (name === 'deskreport_update_task') return mcpApi('PATCH', taskPath, fields);
  if (name === 'deskreport_comment_task') return mcpApi('POST', `${taskPath}/comments`, { content: fields.content, agent });
  if (name === 'deskreport_dispatch_task') return mcpApi('POST', `${taskPath}/dispatch`, fields);
  if (name === 'deskreport_send_agent_message') {
    return mcpApi('POST', '/agents/mcp/team/messages', { toAgent: args.toAgent, message: args.message, taskId: args.taskId, agent, projectPath: currentProject() });
  }
  if (name === 'deskreport_get_team_chat') {
    const query = new URLSearchParams(Object.entries(args).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
    return mcpApi('GET', `/agents/mcp/team/messages?${query}`);
  }
  throw new Error(`Ferramenta ${name} não existe`);
}

// Pasta do projeto onde o agente está, para o agente chamado rodar no mesmo lugar
function currentProject() {
  if (!config.workspaceRoot) return undefined;
  const folder = path.relative(config.workspaceRoot, process.cwd()).split(path.sep)[0];
  return /^[\w-][\w.-]*$/.test(folder) ? folder : undefined;
}

async function mcpApi(method, route, body) {
  if (!config.machineToken) throw new Error('Máquina sem chave do DeskReport. Rode deskreport setup.');

  const res = await fetch(config.apiUrl + route, {
    method,
    headers: { Authorization: `Bearer ${config.machineToken}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error([data.message || `Erro ${res.status}`].flat().join(', '));
  return data;
}

function openUrl(url) {
  let opener = ['xdg-open', [url]];
  if (process.platform === 'darwin') opener = ['open', [url]];
  if (process.platform === 'win32') opener = ['rundll32', ['url.dll,FileProtocolHandler', url]];
  spawn(opener[0], opener[1], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
}

// Janela de aplicativo sem barra de endereço. O perfil próprio faz o widget abrir como um app separado
// do navegador do usuário, com tamanho fixo e ícone próprio na barra de tarefas
function openNativeWidget() {
  const appArgs = [
    `--app=${widgetUrl}`,
    '--window-size=420,680',
    `--user-data-dir=${path.join(configDir, 'window')}`,
    '--class=DeskReport',
    '--no-first-run',
    '--no-default-browser-check',
  ];

  if (process.platform === 'darwin') {
    function tryMacApp(list) {
      if (list.length === 0) return openUrl(widgetUrl);
      execFile('open', ['-na', list[0], '--args', ...appArgs], (error) => {
        if (error) tryMacApp(list.slice(1));
      });
    }
    tryMacApp(['Google Chrome', 'Microsoft Edge', 'Brave Browser', 'Chromium']);
    return;
  }

  function tryBrowser(list) {
    if (list.length === 0) return openUrl(widgetUrl);
    const child = spawn(list[0], appArgs, { detached: true, stdio: 'ignore' });
    child.on('error', () => tryBrowser(list.slice(1)));
    child.unref();
  }

  if (process.platform === 'win32') {
    tryBrowser([
      path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]);
    return;
  }
  tryBrowser(['google-chrome', 'chromium', 'chromium-browser', 'brave-browser', 'microsoft-edge']);
}

// urgent toca som e fica na tela até o usuário ver
function notify(message, urgent = false) {
  if (!config.alerts) return;
  if (process.platform === 'darwin') {
    const sound = urgent ? ' sound name "Glass"' : '';
    execFile('osascript', ['-e', `display notification ${JSON.stringify(message)} with title "DeskReport"${sound}`], () => {});
    return;
  }
  if (process.platform === 'win32') {
    // A mensagem vai por variável de ambiente para não virar código no PowerShell
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$n = New-Object System.Windows.Forms.NotifyIcon',
      '$n.Icon = [System.Drawing.SystemIcons]::Information',
      '$n.Visible = $true',
      urgent ? '[System.Media.SystemSounds]::Exclamation.Play()' : '',
      `$n.ShowBalloonTip(5000, 'DeskReport', $env:DESKREPORT_NOTIFY, '${urgent ? 'Warning' : 'Info'}')`,
      'Start-Sleep -Seconds 6',
      '$n.Dispose()',
    ].filter(Boolean).join('; ');
    execFile('powershell', ['-NoProfile', '-Command', script], { env: { ...process.env, DESKREPORT_NOTIFY: message }, windowsHide: true }, () => {});
    return;
  }
  const linux = urgent ? ['-u', 'critical', '-h', 'string:sound-name:dialog-warning'] : [];
  execFile('notify-send', [...linux, 'DeskReport', message], () => {});
  if (urgent) execFile('canberra-gtk-play', ['-i', 'dialog-warning'], () => {});
}

const connectedHtml = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>DeskReport</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#09090b;color:#fafafa;font-family:system-ui,sans-serif">
<div style="text-align:center"><h1 style="font-size:20px">Máquina conectada ao DeskReport</h1>
<p style="color:#a1a1aa">Pode fechar esta aba e voltar ao widget.</p></div></body></html>`;

const iconSvg = `<svg width="31" height="30" viewBox="0 0 31 30" fill="none" xmlns="http://www.w3.org/2000/svg">
<path opacity="0.5" d="M15.5 2.5C13.0277 2.5 10.611 3.23311 8.55538 4.60663C6.49976 5.98015 4.89761 7.93238 3.95151 10.2165C3.00542 12.5005 2.75787 15.0139 3.24019 17.4386C3.72251 19.8634 4.91302 22.0907 6.66117 23.8388C8.40933 25.587 10.6366 26.7775 13.0614 27.2598C15.4861 27.7421 17.9995 27.4946 20.2836 26.5485C22.5676 25.6024 24.5199 24.0002 25.8934 21.9446C27.2669 19.889 28 17.4723 28 15" stroke="#3b82f6" stroke-width="4.2" stroke-linecap="round"/>
<path d="M15.5 2.5C13.8585 2.5 12.233 2.82332 10.7165 3.45151C9.19989 4.07969 7.8219 5.00044 6.66116 6.16117C5.50043 7.3219 4.57969 8.69989 3.9515 10.2165C3.32332 11.733 3 13.3585 3 15C3 16.6415 3.32332 18.267 3.95151 19.7835C4.57969 21.3001 5.50043 22.6781 6.66117 23.8388C7.8219 24.9996 9.19989 25.9203 10.7165 26.5485C12.233 27.1767 13.8585 27.5 15.5 27.5" stroke="#3b82f6" stroke-width="4.2" stroke-linecap="round"/>
<path d="M13 14.3678L15.7755 16.6667L23 8.33334" stroke="#3b82f6" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const widgetHtml = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>DeskReport</title>
<link rel="icon" href="/icon.svg">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  [hidden] { display: none !important; }
  :root {
    --bg: #0b0d12;
    --surface: #12151c;
    --surface-2: #181c25;
    --line: #1f2430;
    --text: #e8ebf2;
    --muted: #8a92a6;
    --faint: #5b6378;
    --blue: #3b82f6;
    --blue-soft: #16233d;
    --blue-text: #93c5fd;
    --red: #f87171;
    --red-soft: #2a1618;
    --amber: #fbbf24;
    --amber-soft: #2a2112;
  }
  html, body { height: 100%; }
  body {
    background: var(--bg);
    color: var(--text);
    font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
    overflow: hidden;
    user-select: none;
  }
  button { font: inherit; color: inherit; }
  input { font: inherit; }
  #app { height: 100%; display: flex; flex-direction: column; }

  header { display: flex; align-items: center; gap: 10px; padding: 16px 18px 12px; }
  header svg { width: 26px; height: 26px; flex: none; }
  .title { flex: 1; min-width: 0; }
  .title strong { display: block; font-size: 14px; font-weight: 600; }
  .title span { display: block; font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .status { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); padding: 4px 10px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); }
  .status i { width: 7px; height: 7px; border-radius: 50%; background: var(--faint); }
  .status.on i { background: var(--blue); }
  .status.on { color: var(--blue-text); }

  nav { display: flex; gap: 4px; margin: 0 18px 12px; padding: 4px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; }
  nav button { flex: 1; padding: 7px 0; border: 0; background: none; border-radius: 9px; color: var(--muted); font-size: 12px; font-weight: 500; cursor: pointer; }
  nav button:hover { color: var(--text); }
  nav button.active { background: var(--surface-2); color: var(--text); }

  main { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .view { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 0 18px 18px; }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  .label { font-size: 11px; font-weight: 600; color: var(--faint); text-transform: uppercase; letter-spacing: 0.06em; padding: 4px 2px 0; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
  .list > * + * { border-top: 1px solid var(--line); }
  .muted { color: var(--muted); }
  .empty { padding: 22px 16px; text-align: center; color: var(--muted); font-size: 12px; }
  .error { padding: 10px 14px; color: var(--red); font-size: 12px; }
  .notice { padding: 10px 14px; color: var(--blue-text); font-size: 12px; }

  .primary, .ghost, .danger { border: 0; border-radius: 10px; padding: 10px 14px; font-size: 12px; font-weight: 600; cursor: pointer; }
  .primary { background: var(--blue); color: #fff; }
  .primary:hover { background: #2f74e6; }
  .primary:disabled { opacity: 0.5; cursor: default; }
  .ghost { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); }
  .ghost:hover { background: #1f2430; }
  .danger { background: var(--red-soft); color: var(--red); }
  .small { padding: 6px 10px; font-size: 11px; border-radius: 8px; }
  .actions { display: flex; gap: 8px; }
  .actions button { flex: 1; }

  .hero { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 12px; padding: 0 12px; }
  .hero svg { width: 52px; height: 52px; }
  .hero h2 { font-size: 17px; font-weight: 600; }
  .hero p { color: var(--muted); font-size: 12px; max-width: 280px; }
  .hero .primary { margin-top: 8px; width: 100%; max-width: 280px; }

  .agent { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .agent.working { border-color: #24406e; }
  .agent.paused { border-color: #4a2427; }
  .agent-top { display: flex; align-items: center; gap: 12px; }
  .avatar { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; font-size: 11px; font-weight: 700; background: var(--surface-2); color: var(--blue-text); border: 1px solid var(--line); flex: none; }
  .working .avatar { background: var(--blue); color: #fff; border-color: var(--blue); }
  .agent-name { flex: 1; min-width: 0; }
  .agent-name strong { display: block; font-size: 13px; font-weight: 600; }
  .agent-name span { display: block; font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip { font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 999px; background: var(--surface-2); color: var(--muted); white-space: nowrap; }
  .working .chip { background: var(--blue-soft); color: var(--blue-text); }
  .paused .chip { background: var(--red-soft); color: var(--red); }
  .chip.quota { background: var(--surface-2); color: var(--muted); }
  .chip.quota.high { background: var(--amber-soft); color: var(--amber); }
  .action { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted); background: var(--bg); border-radius: 8px; padding: 7px 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .working .action { color: var(--blue-text); }
  .model { display: flex; gap: 6px; align-items: center; }
  .model span { font-size: 11px; color: var(--faint); }
  .model input { flex: 1; min-width: 0; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--text); background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; outline: none; }
  .model input:focus { border-color: var(--blue); }

  .alert { background: var(--amber-soft); color: var(--amber); border-radius: 12px; padding: 12px 14px; font-size: 12px; display: flex; flex-direction: column; gap: 8px; }
  .alert button { align-self: flex-start; background: var(--amber); color: #1a1405; border: 0; border-radius: 8px; padding: 6px 10px; font-size: 11px; font-weight: 600; cursor: pointer; }

  .log { display: flex; gap: 10px; padding: 9px 14px; font-size: 11px; }
  .log b { color: var(--blue-text); font-weight: 600; flex: none; width: 24px; }
  .log span { flex: 1; min-width: 0; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .log time { color: var(--faint); flex: none; }

  .row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; }
  .row-text { flex: 1; min-width: 0; }
  .row-text strong { display: block; font-size: 12px; font-weight: 500; }
  .row-text span { display: block; font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  button.row { width: 100%; border: 0; background: none; text-align: left; cursor: pointer; }
  button.row:hover { background: var(--surface-2); }
  .icon { width: 30px; height: 30px; border-radius: 8px; background: var(--surface-2); display: grid; place-items: center; font-size: 13px; flex: none; color: var(--muted); }
  .chevron { color: var(--faint); font-size: 16px; }
  .path { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted); padding: 10px 14px; word-break: break-all; }

  .switch { position: relative; width: 34px; height: 20px; flex: none; }
  .switch input { appearance: none; position: absolute; inset: 0; margin: 0; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--line); cursor: pointer; }
  .switch input::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--muted); transition: transform 0.15s; }
  .switch input:checked { background: var(--blue); border-color: var(--blue); }
  .switch input:checked::after { transform: translateX(14px); background: #fff; }

  .option { display: flex; align-items: center; gap: 12px; padding: 12px 14px; cursor: pointer; }
  .option .row-text { flex: 1; }
  .option input[type=checkbox].pick { accent-color: var(--blue); width: 15px; height: 15px; margin: 0; }
  .tag { font-size: 10px; color: var(--blue-text); background: var(--blue-soft); border-radius: 999px; padding: 2px 8px; }
  .roles summary { font-size: 11px; color: var(--muted); padding: 0 14px 12px 41px; cursor: pointer; }
  .roles summary:hover { color: var(--text); }
  .role { display: flex; align-items: center; gap: 10px; padding: 8px 14px 8px 41px; cursor: pointer; }
  .role .row-text strong { font-size: 12px; }
  .back { display: flex; align-items: center; gap: 8px; }
  .back h2 { font-size: 14px; font-weight: 600; }
  .back p { font-size: 11px; color: var(--muted); }
</style>
</head>
<body>
<div id="app">
  <header>
    ${iconSvg}
    <div class="title"><strong>DeskReport</strong><span id="org">Máquina não conectada</span></div>
    <span id="status" class="status"><i></i><span id="conn">Desconectado</span></span>
  </header>

  <nav id="tabs" hidden>
    <button data-tab="agents" class="active">Agentes</button>
    <button data-tab="projects">Projetos</button>
    <button data-tab="settings">Ajustes</button>
  </nav>

  <main>
    <section id="setup" class="view" hidden>
      <div class="hero">
        ${iconSvg}
        <h2>Conecte esta máquina</h2>
        <p>Ligue o computador à sua organização para receber tarefas e rodar os agentes nos projetos locais.</p>
        <button id="connect" class="primary">Conectar com DeskReport</button>
      </div>
    </section>

    <section id="agentsView" class="view" hidden>
      <div id="agents" class="scroll"></div>
    </section>

    <section id="projectsView" class="view" hidden>
      <div class="card list">
        <button id="folder" class="row">
          <span class="icon">⌂</span>
          <span class="row-text"><strong id="folderName">Escolher pasta</strong><span id="folderPath">Pasta raiz dos projetos</span></span>
          <span class="chevron">›</span>
        </button>
      </div>
      <div class="label">Pastas que viram projetos</div>
      <div id="folders" class="scroll"></div>
      <button id="syncProjects" class="primary">Sincronizar projetos</button>
    </section>

    <section id="settingsView" class="view" hidden>
      <div class="scroll">
        <div class="label">Geral</div>
        <div class="card list">
          <label class="row">
            <span class="row-text"><strong>Iniciar com o sistema</strong><span>Roda em segundo plano ao ligar o computador</span></span>
            <span class="switch"><input id="autostart" type="checkbox"></span>
          </label>
          <label class="row">
            <span class="row-text"><strong>Alertas no desktop</strong><span>Avisos de início, fim e cota dos agentes</span></span>
            <span class="switch"><input id="alerts" type="checkbox"></span>
          </label>
        </div>
        <div id="prefsError" class="error" hidden></div>

        <div class="label">Máquina</div>
        <div class="card list">
          <button id="openChooser" class="row">
            <span class="icon">◎</span>
            <span class="row-text"><strong>Agentes e cargos</strong><span id="agentsSummary">Escolha os agentes desta máquina</span></span>
            <span class="chevron">›</span>
          </button>
          <button id="changeFolder" class="row">
            <span class="icon">⌂</span>
            <span class="row-text"><strong>Pasta do workspace</strong><span id="settingsFolder">Nenhuma pasta escolhida</span></span>
            <span class="chevron">›</span>
          </button>
          <button id="openWeb" class="row">
            <span class="icon">↗</span>
            <span class="row-text"><strong>Abrir o painel</strong><span>Tarefas e projetos no navegador</span></span>
            <span class="chevron">›</span>
          </button>
        </div>

        <div id="quitError" class="error" hidden></div>
        <button id="quit" class="danger">Encerrar DeskReport</button>
      </div>
    </section>

    <section id="picker" class="view" hidden>
      <div class="back"><div><h2>Pasta do workspace</h2><p>Escolha a pasta raiz onde ficam os projetos.</p></div></div>
      <div id="path" class="card path"></div>
      <div id="dirs" class="scroll card list" style="gap:0"></div>
      <div class="actions">
        <button id="cancel" class="ghost">Cancelar</button>
        <button id="use" class="primary">Usar esta pasta</button>
      </div>
    </section>

    <section id="chooser" class="view" hidden>
      <div class="back"><div><h2>Agentes desta máquina</h2><p>Marque os agentes que você usa e os cargos de cada um.</p></div></div>
      <div id="options" class="scroll card list" style="gap:0"></div>
      <div class="actions">
        <button id="closeAgents" class="ghost">Cancelar</button>
        <button id="saveAgents" class="primary">Salvar</button>
      </div>
    </section>
  </main>
</div>

<script>
  const initials = { antigravity: 'AG', claude: 'CC', opencode: 'OC', codex: 'CX', gemini: 'GM', aider: 'AD' };
  const views = ['setup', 'agentsView', 'projectsView', 'settingsView', 'picker', 'chooser'];
  const list = document.getElementById('agents');
  const dirs = document.getElementById('dirs');
  const options = document.getElementById('options');
  const folders = document.getElementById('folders');
  const syncButton = document.getElementById('syncProjects');
  const connect = document.getElementById('connect');
  const events = new EventSource('/events');

  let state = { catalog: [], roleCatalog: [], agents: [], logs: [], hasToken: false, workspaceRoot: '', workspaceName: '', connected: false };
  let tab = 'agents';
  let overlay = '';
  let pickerPath = '';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function rowText(title, subtitle) {
    const text = el('span', 'row-text');
    text.append(el('strong', '', title), el('span', '', subtitle));
    return text;
  }

  function show() {
    let current = overlay;
    if (!current) current = state.hasToken ? tab + 'View' : 'setup';
    for (const id of views) document.getElementById(id).hidden = id !== current;
    document.getElementById('tabs').hidden = Boolean(overlay) || !state.hasToken;
    document.getElementById('cancel').hidden = !state.workspaceRoot;
    for (const button of document.querySelectorAll('nav button')) button.classList.toggle('active', button.dataset.tab === tab);
  }

  function openTab(name) {
    tab = name;
    overlay = '';
    if (name === 'projects') loadProjects();
    show();
  }

  async function postJson(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    if (res.ok) return null;
    return (await res.json()).error || 'Algo deu errado';
  }

  function dirButton(name, target, isParent) {
    const button = el('button', 'row');
    button.append(el('span', 'icon', isParent ? '↑' : '▸'), rowText(name, isParent ? 'Voltar uma pasta' : ''), el('span', 'chevron', '›'));
    button.onclick = function () { openPicker(target); };
    return button;
  }

  async function openPicker(dir) {
    overlay = 'picker';
    show();
    const res = await fetch('/fs/dirs?path=' + encodeURIComponent(dir || ''));
    const data = await res.json();
    if (!res.ok) return dirs.replaceChildren(el('div', 'error', data.error));

    pickerPath = data.current;
    document.getElementById('path').textContent = data.current;
    const items = data.dirs.map(function (d) { return dirButton(d.name, d.path); });
    if (data.parent) items.unshift(dirButton('..', data.parent, true));
    if (data.dirs.length === 0) items.push(el('div', 'empty', 'Nenhuma subpasta aqui'));
    dirs.replaceChildren(...items);
    dirs.scrollTop = 0;
  }

  async function useFolder() {
    const error = await postJson('/config/workspace', { workspaceRoot: pickerPath });
    if (error) return dirs.prepend(el('div', 'error', error));
    overlay = '';
    if (state.hasToken) openTab('projects');
    else show();
  }

  async function loadProjects() {
    syncButton.disabled = true;
    syncButton.textContent = 'Sincronizar projetos';
    const data = await (await fetch('/projects/folders')).json();
    syncButton.disabled = data.folders.length === 0;
    if (data.folders.length === 0) return folders.replaceChildren(el('div', 'card empty', state.workspaceRoot ? 'Nenhuma subpasta neste workspace' : 'Escolha a pasta do workspace primeiro'));
    const card = el('div', 'card list');
    card.append(...data.folders.map(function (name) {
      const row = el('div', 'row');
      row.append(el('span', 'icon', '▣'), rowText(name, ''));
      return row;
    }));
    folders.replaceChildren(card);
  }

  async function syncFolders() {
    syncButton.disabled = true;
    syncButton.textContent = 'Sincronizando...';
    const res = await fetch('/projects/sync', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      folders.prepend(el('div', 'error', data.error));
      syncButton.disabled = false;
      syncButton.textContent = 'Sincronizar projetos';
      return;
    }
    syncButton.textContent = data.folders.length + ' projetos sincronizados';
  }

  function openChooser() {
    overlay = 'chooser';
    options.replaceChildren(...state.catalog.map(function (a) {
      const item = el('div');
      const label = el('label', 'option');
      const input = el('input', 'pick agent-check');
      input.type = 'checkbox';
      input.value = a.agent;
      input.checked = a.enabled;
      label.append(input, el('span', 'avatar', initials[a.agent]), rowText(a.name, a.detected ? 'Instalado nesta máquina' : 'Não encontrado no PATH'));
      if (a.detected) label.append(el('span', 'tag', 'Instalado'));

      const roles = el('details', 'roles');
      roles.hidden = !a.enabled;
      input.onchange = function () { roles.hidden = !input.checked; };
      roles.append(el('summary', '', 'Cargos e funções'), ...state.roleCatalog.map(function (r) {
        const row = el('label', 'role');
        const toggle = el('input', 'role-check');
        toggle.type = 'checkbox';
        toggle.dataset.agent = a.agent;
        toggle.value = r.role;
        toggle.checked = a.roles.includes(r.role);
        const knob = el('span', 'switch');
        knob.append(toggle);
        row.append(rowText(r.name, r.description), knob);
        return row;
      }));
      item.append(label, roles);
      return item;
    }));
    show();
  }

  async function saveAgents() {
    const checked = Array.from(options.querySelectorAll('.agent-check:checked')).map(function (input) { return input.value; });
    const roles = {};
    for (const toggle of options.querySelectorAll('.role-check:checked')) {
      roles[toggle.dataset.agent] = (roles[toggle.dataset.agent] || []).concat(toggle.value);
    }
    const error = await postJson('/config/agents', { enabledAgents: checked }) || await postJson('/config/agent-roles', { roles: roles });
    if (error) return options.prepend(el('div', 'error', error));
    options.prepend(el('div', 'notice', 'Agentes e cargos salvos'));
    options.scrollTop = 0;
    setTimeout(function () { overlay = ''; show(); }, 1200);
  }

  function agentCard(a) {
    const working = a.state === 'working';
    const paused = a.state === 'paused';
    const card = el('div', 'card agent' + (working ? ' working' : '') + (paused ? ' paused' : ''));

    const top = el('div', 'agent-top');
    const name = el('div', 'agent-name');
    name.append(el('strong', '', a.name), el('span', '', [a.project, a.task].filter(Boolean).join(' · ') || 'Sem tarefa no momento'));
    top.append(el('span', 'avatar', initials[a.agent]), name);
    if (a.quota !== null) top.append(el('span', 'chip quota' + (a.quota >= 40 ? ' high' : ''), 'Cota ' + a.quota + '%'));
    top.append(el('span', 'chip', paused ? 'Pausado' : working ? 'Trabalhando' : 'Disponível'));
    card.append(top);
    if (a.action) card.append(el('div', 'action', a.action));

    const model = el('form', 'model');
    const input = el('input');
    input.value = a.model;
    input.placeholder = 'padrão';
    input.setAttribute('aria-label', 'Modelo do ' + a.name);
    model.append(el('span', '', 'Modelo'), input, el('button', 'ghost small', paused ? 'Trocar e retomar' : 'Usar'));
    model.onsubmit = async function (event) {
      event.preventDefault();
      input.blur();
      const error = await postJson('/config/models', { agent: a.agent, model: input.value });
      if (error) window.alert(error);
    };
    card.append(model);
    return card;
  }

  function alertBox(a) {
    const box = el('div', 'alert', a.alert);
    if (a.quotaLevel !== 'stop') return box;
    const go = el('button', '', 'Continuar mesmo assim');
    go.onclick = function () {
      go.disabled = true;
      postJson('/quota/continue', { agent: a.agent });
    };
    box.append(go);
    return box;
  }

  function activity(logs) {
    const recent = logs.slice(-8).reverse();
    if (recent.length === 0) return [];
    const card = el('div', 'card list');
    card.append(...recent.map(function (log) {
      const row = el('div', 'log');
      const time = el('time', '', new Date(log.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      row.append(el('b', '', initials[log.agent] || ''), el('span', '', log.action), time);
      return row;
    }));
    return [el('div', 'label', 'Atividade recente'), card];
  }

  function renderAgents() {
    if (list.contains(document.activeElement)) return;
    if (state.agents.length === 0) {
      const empty = el('div', 'card empty', 'Nenhum agente ativo. Escolha os agentes em Ajustes.');
      return list.replaceChildren(empty);
    }
    const alerts = state.agents.filter(function (a) { return a.alert; }).map(alertBox);
    list.replaceChildren(...alerts, ...state.agents.map(agentCard), ...activity(state.logs || []));
  }

  function render(data) {
    state = data;
    const status = document.getElementById('status');
    status.className = data.connected ? 'status on' : 'status';
    document.getElementById('conn').textContent = data.connected ? 'Online' : data.hasToken ? 'Reconectando' : 'Desconectado';
    document.getElementById('org').textContent = data.organizationName || (data.hasToken ? 'Organização conectada' : 'Máquina não conectada');
    document.getElementById('folderName').textContent = data.workspaceName || 'Escolher pasta';
    document.getElementById('folderPath').textContent = data.workspaceRoot || 'Pasta raiz dos projetos';
    document.getElementById('settingsFolder').textContent = data.workspaceRoot || 'Nenhuma pasta escolhida';
    document.getElementById('agentsSummary').textContent = data.agents.map(function (a) { return a.name; }).join(', ') || 'Nenhum agente ativo';
    document.getElementById('autostart').checked = data.autostart;
    document.getElementById('alerts').checked = data.alertsOn;
    document.getElementById('quit').disabled = data.busy;
    connect.disabled = data.authPending;
    connect.textContent = data.authPending ? 'Aguardando login no navegador...' : 'Conectar com DeskReport';
    renderAgents();
    if (!data.workspaceRoot && !overlay) openPicker('');
    show();
  }

  async function changePreference(input, key) {
    const prefsError = document.getElementById('prefsError');
    const body = {};
    body[key] = input.checked;
    const error = await postJson('/config/preferences', body);
    prefsError.hidden = !error;
    prefsError.textContent = error || '';
    if (error) input.checked = !input.checked;
  }

  async function quit() {
    if (!window.confirm('Encerrar o DeskReport? Os agentes deixam de receber tarefas até você abrir de novo.')) return;
    const quitError = document.getElementById('quitError');
    const error = await postJson('/quit');
    quitError.hidden = !error;
    quitError.textContent = error || '';
    if (error) return;
    events.close();
    document.getElementById('app').replaceChildren(el('div', 'hero', 'DeskReport encerrado. Pode fechar esta janela.'));
    window.close();
  }

  for (const button of document.querySelectorAll('nav button')) button.onclick = function () { openTab(button.dataset.tab); };
  document.getElementById('folder').onclick = function () { openPicker(state.workspaceRoot); };
  document.getElementById('changeFolder').onclick = function () { openPicker(state.workspaceRoot); };
  document.getElementById('cancel').onclick = function () { overlay = ''; show(); };
  document.getElementById('openChooser').onclick = openChooser;
  document.getElementById('closeAgents').onclick = function () { overlay = ''; show(); };
  document.getElementById('saveAgents').onclick = saveAgents;
  document.getElementById('use').onclick = useFolder;
  document.getElementById('openWeb').onclick = function () { postJson('/open-web'); };
  document.getElementById('autostart').onchange = function (event) { changePreference(event.target, 'autostart'); };
  document.getElementById('alerts').onchange = function (event) { changePreference(event.target, 'alerts'); };
  document.getElementById('quit').onclick = quit;
  syncButton.onclick = syncFolders;
  connect.onclick = function () { postJson('/auth/start'); };
  events.onmessage = function (event) { render(JSON.parse(event.data)); };
  events.onerror = function () {
    document.getElementById('status').className = 'status';
    document.getElementById('conn').textContent = 'Client parado';
  };
</script>
</body>
</html>`;

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : undefined;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function runCliCommand(cmd) {
  config = loadConfig();
  if (!config.machineToken) {
    console.error('Máquina não conectada ao DeskReport. Rode deskreport setup ou abra o widget.');
    process.exit(1);
  }

  if (cmd === 'projects') {
    const list = await mcpApi('GET', '/agents/mcp/projects');
    if (!list?.length) {
      console.log('Nenhum projeto encontrado.');
      return;
    }
    console.log(`Projetos da organização (${list.length}):`);
    for (const p of list) {
      const folderInfo = p.folder ? ` (pasta: ${p.folder})` : '';
      console.log(`  - ${p.name}${folderInfo} [${p.id}]`);
    }
    return;
  }

  if (cmd === 'task' || cmd === 'tasks') {
    const sub = process.argv[3];

    if (!sub || sub === 'list') {
      const project = getArg('--project') || currentProject();
      const status = getArg('--status');
      const params = new URLSearchParams();
      if (project) params.set('project', project);
      if (status) params.set('status', status);

      const tasks = await mcpApi('GET', `/agents/mcp/tasks?${params}`);
      if (!tasks?.length) {
        console.log('Nenhuma tarefa encontrada.');
        return;
      }
      console.log(`Tarefas encontradas (${tasks.length}):`);
      for (const t of tasks) {
        const short = '#' + String(t.shortId).padStart(3, '0');
        const st = t.status || 'todo';
        const pr = t.priority || 'medium';
        const assign = t.assignees?.length ? ` [@${t.assignees.map((a) => a.name).join(', ')}]` : '';
        console.log(`  ${short} [${st}] (${pr}) ${t.title}${assign}`);
      }
      return;
    }

    if (sub === 'create') {
      const title = process.argv[4] && !process.argv[4].startsWith('--') ? process.argv[4] : getArg('--title');
      if (!title) {
        console.error('Uso: deskreport task create "Título da tarefa" [--project <nome>] [--desc <desc>] [--priority <urgência>] [--assignee <agente>] [--dispatch]');
        process.exit(1);
      }
      const project = getArg('--project') || currentProject();
      const description = getArg('--desc') || getArg('--description');
      const priority = getArg('--priority') || 'medium';
      const assignee = getArg('--assignee') || getArg('--agent');

      const data = {
        title,
        description,
        project,
        priority,
        assigneeIds: assignee ? [assignee] : undefined,
        agent: assignee || 'antigravity',
      };

      const created = await mcpApi('POST', '/agents/mcp/tasks', data);
      const short = '#' + String(created.shortId).padStart(3, '0');
      console.log(`✓ Tarefa ${short} criada com sucesso.`);
      console.log(`  ID: ${created.id}`);
      console.log(`  Título: ${created.title}`);
      console.log(`  Status: ${created.status} | Prioridade: ${created.priority}`);

      if (hasFlag('--dispatch') && assignee) {
        console.log(`Disparando execução para o agente ${assignee}...`);
        await mcpApi('POST', `/agents/mcp/tasks/${created.id}/dispatch`, { agent: assignee });
        console.log(`✓ Tarefa despachada.`);
      }
      return;
    }

    if (sub === 'show' || sub === 'get') {
      const ref = process.argv[4];
      if (!ref) {
        console.error('Uso: deskreport task show <id ou #número>');
        process.exit(1);
      }
      const task = await mcpApi('GET', `/agents/mcp/tasks/${encodeURIComponent(ref)}`);
      const short = '#' + String(task.shortId).padStart(3, '0');
      console.log(`Tarefa ${short}: ${task.title}`);
      console.log(`ID: ${task.id}`);
      console.log(`Status: ${task.status} | Prioridade: ${task.priority}`);
      console.log(`Projeto: ${task.project}`);
      if (task.assignees?.length) console.log(`Responsáveis: ${task.assignees.map((a) => a.name).join(', ')}`);
      if (task.description) {
        console.log('\nDescrição:\n' + task.description.replace(/<[^>]+>/g, ''));
      }
      return;
    }

    if (sub === 'stop') {
      const ref = process.argv[4];
      if (!ref) {
        console.error('Uso: deskreport task stop <id ou #número>');
        process.exit(1);
      }
      console.log(`Enviando pedido de parada para a tarefa ${ref}...`);
      await mcpApi('POST', `/agents/mcp/tasks/${encodeURIComponent(ref)}/stop`, {});
      console.log(`✓ Pedido de parada enviado.`);
      return;
    }

    console.error(`Subcomando desconhecido: deskreport task ${sub}. Use list, create, show ou stop.`);
    process.exit(1);
  }

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(`DeskReport CLI:
  deskreport                   Inicia o daemon local de agentes e widget
  deskreport --background      Inicia em segundo plano, sem prender o terminal
  deskreport widget            Abre o app do widget (sobe o client se precisar)
  deskreport mcp [--agent <x>] Roda o servidor MCP para agentes
  deskreport setup             Conecta a máquina à organização
  deskreport projects          Lista os projetos da organização
  deskreport task list         Lista as tarefas
  deskreport task create       Cria uma nova tarefa
  deskreport task show <id>    Mostra detalhes de uma tarefa
  deskreport task stop <id>    Para a execução de uma tarefa
`);
    return;
  }

  console.error(`Comando desconhecido: ${cmd}. Use 'deskreport help' para ver os comandos.`);
  process.exit(1);
}

const command = process.argv.includes('--help') || process.argv.includes('-h')
  ? 'help'
  : (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'start');

if (process.argv.includes('--background') && !process.env.DESKREPORT_BACKGROUND) {
  // Segundo plano: devolve o terminal na hora e o client segue rodando sozinho
  if (await isRunning()) console.log('DeskReport já está rodando');
  else {
    startBackground(process.argv.slice(2).filter((arg) => arg !== '--background'));
    console.log(`DeskReport rodando em segundo plano. Log em ${logPath}`);
  }
} else if (command === 'widget') {
  // Abrir o app sem o client rodando sobe o client em segundo plano, e ele mesmo abre a janela
  if (await isRunning()) openNativeWidget();
  else startBackground(['start', '--widget']);
} else if (command === 'mcp') {
  const flag = process.argv.indexOf('--agent');
  const agent = flag > 0 ? process.argv[flag + 1] : process.env.DESKREPORT_AGENT;
  config = loadConfig();
  await mcpServer(agentLabels[agent] ? agent : undefined);
} else if (['projects', 'task', 'tasks', 'help', '--help', '-h'].includes(command) || process.argv.includes('--help')) {
  await runCliCommand(command);
} else {
  config = loadConfig();
  workspaceRoot = config.workspaceRoot;
  detectedAgents = detectAgents();
  enabledAgents = config.enabledAgents || detectedAgents;
  if (!config.enabledAgents) saveConfig({ enabledAgents });
  console.log(`Agentes instalados: ${detectedAgents.join(', ') || 'nenhum'}. Ativos: ${enabledAgents.join(', ') || 'nenhum'}`);
  loadState();
  // Só um client por máquina: se já tem um rodando, este só abre o widget
  if (!(await startLocalServer())) {
    console.log('DeskReport já está rodando');
    if (!process.env.DESKREPORT_BACKGROUND) openNativeWidget();
    process.exit(0);
  }
  setInterval(releaseRenewedQuotas, 60_000);

  const terminalSetup = command === 'setup' || command === 'login';
  if (terminalSetup) await setup();
  if (config.machineToken) connectSocket();
  else console.log(`Abra ${widgetUrl} para conectar a máquina ao DeskReport`);
  if (terminalSetup || !config.machineToken || process.argv.includes('--widget')) openNativeWidget();
}
