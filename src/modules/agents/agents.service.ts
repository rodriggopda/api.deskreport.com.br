import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export const agentNames = ['antigravity', 'claude', 'opencode', 'codex', 'gemini', 'aider'];
export const roleNames = ['engineering', 'review', 'qa', 'architecture', 'devops', 'documentation', 'support'];

const agentUsers = {
  antigravity: agentUser('antigravity', 'Antigravity', '#16a34a', 'AG'),
  claude: agentUser('claude', 'Claude Code', '#ea580c', 'CC'),
  opencode: agentUser('opencode', 'OpenCode', '#2563eb', 'OC'),
  codex: agentUser('codex', 'Codex', '#0d9488', 'CX'),
  gemini: agentUser('gemini', 'Gemini', '#4f46e5', 'GM'),
  aider: agentUser('aider', 'Aider', '#ca8a04', 'AD'),
};

function agentUser(agent: string, name: string, color: string, initials: string) {
  return { id: `agent-user-${agent}`, name, email: `${agent}@agents.deskreport.com.br`, image: avatar(color, initials) };
}

function avatar(color: string, initials: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="${color}"/><text x="32" y="41" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

export type AgentStatus = {
  agent: string;
  state: 'working' | 'idle' | 'paused';
  // Alerta de cota. warn só avisa, stop espera o humano autorizar e block só sai trocando o modelo ou com a cota renovada
  alert?: string;
  quotaLevel?: 'warn' | 'stop' | 'block';
  project?: string;
  action?: string;
  tool?: string;
  file?: string;
  taskId?: string;
  // Tokens gastos na execução atual da tarefa (só o Claude Code informa)
  tokens?: number;
  updatedAt: string;
};

// Saída do terminal guardada por tarefa, só o final dela e só das últimas tarefas
const OUTPUT_MAX_CHARS = 50_000;
const OUTPUT_MAX_TASKS = 20;

const taskStatuses = ['backlog', 'todo', 'in-progress', 'review', 'done', 'release'];
const taskPriorities = ['low', 'medium', 'high', 'urgent'];

const taskInclude = {
  assignees: true,
  team: true,
  comments: { include: { user: true }, orderBy: { createdAt: 'desc' as const } },
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function text(value: unknown, max = 300) {
  return typeof value === 'string' ? value.slice(0, max) : undefined;
}

@Injectable()
export class AgentsService {
  private statuses: Record<string, Record<string, AgentStatus>> = {};
  private taskLogs: Record<string, Record<string, AgentStatus[]>> = {};
  private outputs: Record<string, Record<string, string>> = {};
  private enabledByOrg: Record<string, string[]> = {};

  constructor(private prisma: PrismaService) { }

  // Os agentes são usuários reais do time, assim aparecem como atribuídos e assinam os próprios comentários.
  // Só entram na organização os agentes que alguma máquina habilitou
  async ensureAgentUsers(organizationId: string, agents: string[]) {
    const now = new Date();
    for (const agent of agents) {
      const user = agentUsers[agent];
      if (!user) continue;
      await this.prisma.user.upsert({
        where: { id: user.id },
        create: { ...user, role: 'agent', emailVerified: true, createdAt: now, updatedAt: now },
        update: { name: user.name, image: user.image },
      });
      await this.prisma.member.upsert({
        where: { organizationId_userId: { organizationId, userId: user.id } },
        create: { organizationId, userId: user.id, role: 'member', createdAt: now },
        update: {},
      });
    }
  }

  // Recebe a soma dos agentes que as máquinas conectadas usam
  async setEnabledAgents(organizationId: string, agents: unknown) {
    if (!Array.isArray(agents)) return;

    const enabled = agentNames.filter((agent) => agents.includes(agent));
    this.enabledByOrg[organizationId] = enabled;
    await this.ensureAgentUsers(organizationId, enabled);
  }

  // Sem máquina conectada desde que a API subiu, vale quem já é membro da organização
  async enabledAgents(organizationId: string) {
    const enabled = this.enabledByOrg[organizationId];
    if (enabled) return enabled;

    const members = await this.prisma.member.findMany({
      where: { organizationId, userId: { startsWith: 'agent-user-' } },
      select: { userId: true },
    });
    const userIds = members.map((member) => member.userId);
    return agentNames.filter((agent) => userIds.includes(agentUsers[agent].id));
  }

  listMachines(organizationId: string) {
    return this.prisma.agentMachine.findMany({
      where: { organizationId },
      select: { id: true, name: true, tokenPrefix: true, workspaceRoot: true, agentRoles: true, lastSeenAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createMachine(organizationId: string, data: any) {
    const name = text(data?.name, 100)?.trim();
    const workspaceRoot = text(data?.workspaceRoot, 300)?.trim();
    if (!name || !workspaceRoot) {
      throw new BadRequestException('Informe name e workspaceRoot');
    }

    const token = 'drk_' + randomBytes(24).toString('base64url');
    const machine = await this.prisma.agentMachine.create({
      data: {
        organizationId,
        name,
        workspaceRoot,
        tokenHash: hashToken(token),
        tokenPrefix: token.slice(0, 10),
      },
    });

    return { id: machine.id, name, workspaceRoot, tokenPrefix: machine.tokenPrefix, token };
  }

  async removeMachine(id: string, organizationId: string) {
    const { count } = await this.prisma.agentMachine.deleteMany({ where: { id, organizationId } });
    if (count === 0) throw new NotFoundException('Machine not found');
    return { id };
  }

  // Devolve a organização dona da chave, ou null quando a chave não vale
  async findOrgByMachineToken(token: unknown) {
    if (typeof token !== 'string' || !token.startsWith('drk_')) return null;

    const devToken = process.env.DESKREPORT_DEV_TOKEN;
    if (devToken && token === devToken && process.env.NODE_ENV !== 'production') {
      const org = await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
      return org?.id ?? null;
    }

    const machine = await this.prisma.agentMachine.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!machine) return null;

    await this.prisma.agentMachine.update({ where: { id: machine.id }, data: { lastSeenAt: new Date() } });
    return machine.organizationId;
  }

  // Guarda os cargos que a máquina configurou para cada agente, só aceita agentes e cargos conhecidos
  async saveMachineRoles(organizationId: string, token: unknown, roles: any) {
    if (typeof token !== 'string' || !roles || typeof roles !== 'object') return;

    const agentRoles = {};
    for (const agent of agentNames) {
      const list = roles[agent];
      agentRoles[agent] = Array.isArray(list) ? roleNames.filter((role) => list.includes(role)) : [];
    }
    await this.prisma.agentMachine.updateMany({ where: { organizationId, tokenHash: hashToken(token) }, data: { agentRoles } });
  }

  async isMember(organizationId: string, userId: string) {
    const member = await this.prisma.member.findFirst({ where: { organizationId, userId }, select: { id: true } });
    return !!member;
  }

  async statusList(organizationId: string) {
    const saved = this.statuses[organizationId] || {};
    const enabled = await this.enabledAgents(organizationId);
    return enabled.map((agent) => saved[agent] || { agent, state: 'idle', updatedAt: new Date().toISOString() });
  }

  logsByOrg(organizationId: string) {
    return this.taskLogs[organizationId] || {};
  }

  saveStatus(organizationId: string, data: any) {
    if (!agentNames.includes(data?.agent)) return null;

    const status: AgentStatus = {
      agent: data.agent,
      state: data.state === 'working' || data.state === 'paused' ? data.state : 'idle',
      alert: text(data.alert),
      quotaLevel: ['warn', 'stop', 'block'].includes(data.quotaLevel) ? data.quotaLevel : undefined,
      project: text(data.project, 100),
      action: text(data.action),
      tool: text(data.tool, 60),
      file: text(data.file),
      taskId: text(data.taskId, 60),
      tokens: Number.isInteger(data.tokens) && data.tokens > 0 ? data.tokens : undefined,
      updatedAt: new Date().toISOString(),
    };

    this.statuses[organizationId] = { ...this.statuses[organizationId], [status.agent]: status };

    if (status.taskId && status.action && status.state === 'working') {
      const orgLogs = this.taskLogs[organizationId] || {};
      const current = orgLogs[status.taskId] || [];
      const last = current[current.length - 1];
      if (!last || last.action !== status.action || last.file !== status.file) {
        orgLogs[status.taskId] = [...current.slice(-79), status];
        this.taskLogs[organizationId] = orgLogs;
      }
    }

    return status;
  }

  // Pedaço do stdout/stderr do agente para o terminal ao vivo da tarefa
  appendOutput(organizationId: string, data: any) {
    const taskId = text(data?.taskId, 60);
    const chunk = text(data?.text, 10_000);
    if (!taskId || !chunk) return null;

    const orgOutputs = this.outputs[organizationId] || {};
    orgOutputs[taskId] = ((orgOutputs[taskId] || '') + chunk).slice(-OUTPUT_MAX_CHARS);
    const taskIds = Object.keys(orgOutputs);
    for (const old of taskIds.slice(0, taskIds.length - OUTPUT_MAX_TASKS)) delete orgOutputs[old];
    this.outputs[organizationId] = orgOutputs;
    return { taskId, text: chunk };
  }

  taskOutput(organizationId: string, taskId: string) {
    return { taskId, text: this.outputs[organizationId]?.[taskId] || '' };
  }

  clearOutput(organizationId: string, taskId: string) {
    if (this.outputs[organizationId]) delete this.outputs[organizationId][taskId];
  }

  // Só para tarefa da organização. A máquina mata o processo e devolve o fim pelo machine:task-finished
  async findTaskToStop(taskId: string, organizationId: string) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, companyId: organizationId }, select: { id: true } });
    if (!task) throw new NotFoundException('Task not found');
    return task.id;
  }

  // mode comment: o agente foi chamado num comentário e decide se mexe no código ou só responde
  // Sem agent, roda o agente que está nos responsáveis. Sem projectPath, usa a pasta do projeto da tarefa
  async startDispatch(taskId: string, organizationId: string, data: any) {
    const mode = data?.mode === 'comment' ? 'comment' : 'task';
    checkProjectPath(data?.projectPath);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId: organizationId },
      include: {
        assignees: { select: { id: true } },
        comments: { include: { user: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
        attachments: { where: { companyId: organizationId }, select: { id: true, filename: true, size: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');

    const assignedAgent = task.assignees.find((user) => user.id.startsWith('agent-user-'))?.id.replace('agent-user-', '');
    const agent = data?.agent || assignedAgent;
    if (!agentNames.includes(agent)) {
      throw new BadRequestException('Atribua um agente nos responsáveis da tarefa');
    }

    const projectPath = data?.projectPath || (await this.projectFolder(organizationId, task.project));
    if (!projectPath) {
      throw new BadRequestException('O projeto da tarefa não tem pasta. Sincronize as pastas no widget do DeskReport');
    }

    await this.ensureAgentUsers(organizationId, [agent]);
    const updated = await this.prisma.task.update({
      where: { id: task.id },
      data: {
        status: agent === 'antigravity' || mode === 'comment' ? task.status : 'in-progress',
        assignees: { connect: { id: agentUsers[agent].id } },
      },
      include: taskInclude,
    });

    return {
      task: updated,
      taskId: task.id,
      title: task.title,
      description: task.description,
      // Todos os comentários, de pessoas e de agentes, para o próximo agente continuar de onde o time parou
      comments: task.comments.map((c) => `${c.user?.name || 'Membro'}: ${c.content}`),
      project: task.project,
      // O deskreport-client baixa cada anexo e passa o caminho local no prompt do agente
      attachments: task.attachments,
      agent,
      projectPath,
      mode,
      comment: mode === 'comment' ? text(data?.comment, 10000) : undefined,
    };
  }

  // A tarefa guarda o id do projeto, mas tarefas antigas podem ter o nome
  private async projectFolder(organizationId: string, project: string) {
    const found = await this.prisma.project.findFirst({
      where: { organizationId, OR: [{ id: project }, { name: { equals: project, mode: 'insensitive' } }] },
      select: { folder: true },
    });
    return found?.folder || undefined;
  }

  // Rotas do MCP: o agente fala com o DeskReport pela chave da máquina, sempre preso à organização dela
  listProjects(organizationId: string) {
    return this.prisma.project.findMany({
      where: { organizationId },
      select: { id: true, name: true, description: true, folder: true, status: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Cada pasta do Workspace vira um projeto. Projeto que já tem o nome da pasta só ganha o folder
  async syncProjects(organizationId: string, folders: unknown) {
    if (!Array.isArray(folders) || folders.length > 200) {
      throw new BadRequestException('folders deve ser uma lista de pastas');
    }
    for (const folder of folders) checkProjectPath(folder);

    for (const folder of folders as string[]) {
      const project = await this.prisma.project.findFirst({
        where: { organizationId, OR: [{ folder }, { name: { equals: folder, mode: 'insensitive' } }] },
        select: { id: true, folder: true },
      });
      if (!project) {
        await this.prisma.project.create({ data: { organizationId, name: folder, folder } });
      } else if (project.folder !== folder) {
        await this.prisma.project.update({ where: { id: project.id }, data: { folder } });
      }
    }

    return this.listProjects(organizationId);
  }

  createProject(organizationId: string, data: any) {
    const name = text(data?.name, 100)?.trim();
    if (!name) throw new BadRequestException('Informe name');

    return this.prisma.project.create({
      data: { organizationId, name, description: text(data?.description, 2000) },
      select: { id: true, name: true, description: true, status: true },
    });
  }

  async listTasks(organizationId: string, query: any) {
    const project = await this.findProjectId(organizationId, query?.project);

    return this.prisma.task.findMany({
      where: {
        companyId: organizationId,
        project,
        status: taskStatuses.includes(query?.status) ? query.status : undefined,
        priority: taskPriorities.includes(query?.priority) ? query.priority : undefined,
      },
      include: { assignees: true },
      orderBy: { shortId: 'desc' },
      take: 100,
    });
  }

  // Aceita o UUID ou o número curto da tarefa (3 ou #003)
  async findTaskId(organizationId: string, ref: string) {
    const where = /^#?\d{1,9}$/.test(ref)
      ? { companyId: organizationId, shortId: Number(ref.replace('#', '')) }
      : { companyId: organizationId, id: ref };
    const task = await this.prisma.task.findFirst({ where, select: { id: true } });
    if (!task) throw new NotFoundException('Task not found');
    return task.id;
  }

  async getTask(organizationId: string, ref: string) {
    const id = await this.findTaskId(organizationId, ref);
    return this.prisma.task.findFirst({ where: { id, companyId: organizationId }, include: taskInclude });
  }

  // O agente vira o autor da tarefa
  async createTask(organizationId: string, data: any) {
    const agent = data?.agent && agentNames.includes(data.agent) ? data.agent : 'antigravity';
    const { assigneeIds, ...fields } = await this.taskFields(organizationId, data);
    if (!fields.title) throw new BadRequestException('Informe title');

    if (!fields.project) {
      const firstProject = await this.prisma.project.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (firstProject) fields.project = firstProject.id;
      else throw new BadRequestException('Informe project');
    }

    await this.ensureAgentUsers(organizationId, [agent]);
    const last = await this.prisma.task.findFirst({
      where: { companyId: organizationId },
      orderBy: { shortId: 'desc' },
      select: { shortId: true },
    });

    return this.prisma.task.create({
      data: {
        ...fields,
        title: fields.title,
        project: fields.project,
        companyId: organizationId,
        shortId: (last?.shortId || 0) + 1,
        reporterId: agentUsers[agent].id,
        assignees: assigneeIds ? { connect: assigneeIds.map((id) => ({ id })) } : undefined,
      },
      include: taskInclude,
    });
  }

  async updateTask(organizationId: string, ref: string, data: any) {
    const id = await this.findTaskId(organizationId, ref);
    const { assigneeIds, ...fields } = await this.taskFields(organizationId, data);

    return this.prisma.task.update({
      where: { id },
      data: { ...fields, assignees: assigneeIds ? { set: assigneeIds.map((id) => ({ id })) } : undefined },
      include: taskInclude,
    });
  }

  // O comentário sai assinado pelo usuário do agente
  async commentTask(organizationId: string, ref: string, data: any) {
    const agent = agentName(data?.agent);
    const content = text(data?.content, 10000)?.trim();
    if (!content) throw new BadRequestException('Informe content');

    const id = await this.findTaskId(organizationId, ref);
    await this.ensureAgentUsers(organizationId, [agent]);
    await this.prisma.taskComment.create({ data: { taskId: id, userId: agentUsers[agent].id, content: toHtml(content) } });
    return this.prisma.task.findFirst({ where: { id, companyId: organizationId }, include: taskInclude });
  }

  // Campos que o agente pode mandar na criação e na edição, validados aqui na borda
  private async taskFields(organizationId: string, data: any) {
    if (data?.status !== undefined && !taskStatuses.includes(data.status)) {
      throw new BadRequestException('status deve ser um de: ' + taskStatuses.join(', '));
    }
    if (data?.priority !== undefined && !taskPriorities.includes(data.priority)) {
      throw new BadRequestException('priority deve ser um de: ' + taskPriorities.join(', '));
    }
    if (data?.tags !== undefined && (!Array.isArray(data.tags) || data.tags.some((tag: unknown) => typeof tag !== 'string'))) {
      throw new BadRequestException('tags deve ser uma lista de textos');
    }

    const description = text(data?.description, 20000);
    return {
      title: text(data?.title, 300)?.trim() || undefined,
      description: description === undefined ? undefined : toHtml(description),
      project: await this.findProjectId(organizationId, data?.project),
      status: data?.status as string | undefined,
      priority: data?.priority as string | undefined,
      tags: data?.tags?.slice(0, 20).map((tag: string) => ({ label: tag.slice(0, 50), color: 'bg-blue-500 text-blue-500' })),
      assigneeIds: await this.memberIds(organizationId, data?.assigneeIds),
    };
  }

  // Aceita o id ou o nome do projeto, sempre dentro da organização
  private async findProjectId(organizationId: string, value: unknown) {
    const key = text(value, 100)?.trim();
    if (!key) return undefined;

    const project = await this.prisma.project.findFirst({
      where: { organizationId, OR: [{ id: key }, { name: { equals: key, mode: 'insensitive' } }] },
      select: { id: true },
    });
    if (!project) throw new BadRequestException(`Projeto ${key} não encontrado`);
    return project.id;
  }

  // Só aceita membros da organização. Agente pode vir pelo nome (claude, opencode...)
  private async memberIds(organizationId: string, ids: unknown) {
    if (ids === undefined) return undefined;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
      throw new BadRequestException('assigneeIds deve ser uma lista de ids');
    }

    const userIds: string[] = ids.map((id) => agentUsers[id]?.id || id);
    const members = await this.prisma.member.findMany({
      where: { organizationId, userId: { in: userIds } },
      select: { userId: true },
    });
    if (userIds.some((id) => !members.some((member) => member.userId === id))) {
      throw new BadRequestException('assigneeIds tem usuário fora da organização');
    }
    return userIds;
  }

  // Chat Lateral: cada usuário tem as próprias sessões com cada agente. Nova sessão começa com o contexto limpo
  async listSessions(organizationId: string, userId: string, agent: string) {
    agentName(agent);
    await this.ensureMember(organizationId, userId);

    return this.prisma.agentChatSession.findMany({
      where: { organizationId, userId, agent },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  // As sessões anteriores ficam no histórico, mas deixam de ser a ativa
  async createSession(organizationId: string, userId: string, agent: string, data: any) {
    agentName(agent);
    checkProjectPath(data?.projectPath);
    await this.ensureMember(organizationId, userId);
    const taskId = data?.taskId ? await this.findTaskId(organizationId, String(data.taskId)) : undefined;

    await this.prisma.agentChatSession.updateMany({ where: { organizationId, userId, agent, active: true }, data: { active: false } });
    return this.prisma.agentChatSession.create({
      data: { organizationId, userId, agent, title: text(data?.title, 100)?.trim() || undefined, projectPath: data?.projectPath, taskId },
    });
  }

  // Sempre presa ao dono e à organização, ninguém abre a sessão de outro só pelo id
  async findSession(organizationId: string, userId: string, sessionId: string) {
    const session = await this.prisma.agentChatSession.findFirst({ where: { id: sessionId, organizationId, userId } });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  async listSessionMessages(organizationId: string, userId: string, sessionId: string) {
    await this.findSession(organizationId, userId, sessionId);

    const messages = await this.prisma.agentChatMessage.findMany({
      where: { organizationId, sessionId },
      include: { user: { select: { id: true, name: true, image: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return messages.reverse();
  }

  async deleteSession(organizationId: string, userId: string, sessionId: string) {
    const { count } = await this.prisma.agentChatSession.deleteMany({ where: { id: sessionId, organizationId, userId } });
    if (count === 0) throw new NotFoundException('Session not found');
    return { id: sessionId };
  }

  // A primeira mensagem vira o título da sessão e a pasta do projeto fica fixa nela, porque a conversa da CLI mora na pasta
  async saveSessionMessage(organizationId: string, ownerId: string, sessionId: string, data: any) {
    const content = text(data?.content, 10000)?.trim();
    if (!content) throw new BadRequestException('Informe content');
    checkProjectPath(data?.projectPath);
    const session = await this.findSession(organizationId, ownerId, sessionId);
    await this.ensureAgentUsers(organizationId, [session.agent]);

    const message = await this.prisma.agentChatMessage.create({
      data: { organizationId, sessionId, agent: session.agent, ownerId, userId: ownerId, content },
      include: { user: { select: { id: true, name: true, image: true } } },
    });
    const updated = await this.prisma.agentChatSession.update({
      where: { id: session.id },
      data: {
        title: session.title === 'Nova conversa' ? content.slice(0, 60) : session.title,
        projectPath: session.projectPath || data?.projectPath,
        active: true,
      },
    });
    return { message, session: updated };
  }

  // Resposta vinda da máquina, assinada pelo usuário do agente. Guarda o id da conversa da CLI para retomar na próxima mensagem
  async saveChatReply(organizationId: string, data: any) {
    const content = text(data?.content, 10000)?.trim();
    const ownerId = text(data?.ownerId, 60);
    const sessionId = text(data?.sessionId, 60);
    if (!agentNames.includes(data?.agent) || !content || !ownerId || !sessionId) return null;

    const session = await this.prisma.agentChatSession.findFirst({ where: { id: sessionId, organizationId, userId: ownerId, agent: data.agent } });
    if (!session) return null;

    const externalId = text(data?.externalId, 100);
    await this.prisma.agentChatSession.update({
      where: { id: session.id },
      data: { externalId: session.externalId || externalId },
    });
    return this.prisma.agentChatMessage.create({
      data: { organizationId, sessionId, agent: data.agent, ownerId, userId: agentUsers[data.agent].id, content },
      include: { user: { select: { id: true, name: true, image: true } } },
    });
  }

  // Sala do time: conversa entre agentes, sem dono
  async listTeamChat(organizationId: string, query: any) {
    const taskId = query?.taskId ? await this.findTaskId(organizationId, String(query.taskId)) : undefined;
    const take = Math.min(Number(query?.limit) || 50, 100);

    const messages = await this.prisma.agentChatMessage.findMany({
      where: { organizationId, ownerId: null, taskId },
      include: { user: { select: { id: true, name: true, image: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return messages.reverse();
  }

  // toAgent vazio ou team vai para o time todo
  async saveTeamMessage(organizationId: string, fromAgent: unknown, data: any) {
    const agent = agentName(fromAgent);
    const content = text(data?.message, 10000)?.trim();
    if (!content) throw new BadRequestException('Informe message');

    const toAgent = data?.toAgent && data.toAgent !== 'team' ? agentName(data.toAgent) : null;
    if (toAgent === agent) throw new BadRequestException('toAgent deve ser outro agente');
    const taskId = data?.taskId ? await this.findTaskId(organizationId, String(data.taskId)) : null;

    await this.ensureAgentUsers(organizationId, [agent]);
    return this.prisma.agentChatMessage.create({
      data: { organizationId, agent, userId: agentUsers[agent].id, targetAgent: toAgent, taskId, content },
      include: { user: { select: { id: true, name: true, image: true } } },
    });
  }

  private async ensureMember(organizationId: string, userId: string) {
    if (!(await this.isMember(organizationId, userId))) throw new NotFoundException('Organization not found');
  }

  async finishTask(organizationId: string, data: any) {
    const taskId = text(data?.taskId, 60);
    if (!taskId) return null;

    const task = await this.prisma.task.findFirst({ where: { id: taskId, companyId: organizationId } });
    if (!task) return null;

    const agentUser = agentUsers[data.agent];
    const tokens = Number.isInteger(data.tokens) && data.tokens > 0 ? data.tokens : 0;
    if (tokens) {
      await this.prisma.task.update({ where: { id: task.id }, data: { tokensUsed: { increment: tokens } } });
    }
    // Parada pelo usuário: a tarefa volta para A fazer
    if (data.stopped && task.status === 'in-progress') {
      await this.prisma.task.update({ where: { id: task.id }, data: { status: 'todo' } });
    }
    if (data.exitCode === 0 && data.agent !== 'antigravity' && data.mode !== 'comment') {
      // A revisão vai para o Antigravity só quando a organização usa esse agente
      const hasReviewer = (await this.enabledAgents(organizationId)).includes('antigravity');
      await this.prisma.task.update({
        where: { id: task.id },
        data: hasReviewer ? { status: 'review', assignees: { connect: { id: agentUsers.antigravity.id } } } : { status: 'review' },
      });
    }

    const userId = agentUser?.id || task.reporterId || (await this.prisma.member.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    }))?.userId;

    if (userId) {
      await this.prisma.taskComment.create({
        data: { taskId: task.id, userId, content: finishedComment(data) },
      });
    }

    return this.prisma.task.findFirst({ where: { id: task.id, companyId: organizationId }, include: taskInclude });
  }
}

// Resposta enxuta para o chat do agente: sem avatar em base64 nem dados de conta
export function compactTask(task: any) {
  return {
    id: task.id,
    shortId: task.shortId,
    title: task.title,
    description: task.description,
    project: task.project,
    status: task.status,
    priority: task.priority,
    tags: task.tags,
    reporterId: task.reporterId,
    assignees: task.assignees?.map((user: any) => ({ id: user.id, name: user.name })),
    comments: task.comments?.map((comment: any) => ({ author: comment.user?.name, content: comment.content, createdAt: comment.createdAt })),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

// Só o nome de uma pasta do workspace, sem subir de diretório
export function checkProjectPath(value: unknown) {
  if (value !== undefined && (typeof value !== 'string' || !/^[\w.-]+$/.test(value) || value.startsWith('.'))) {
    throw new BadRequestException('projectPath deve ser o nome de uma pasta do workspace');
  }
}

function agentName(value: unknown) {
  if (typeof value !== 'string' || !agentNames.includes(value)) {
    throw new BadRequestException('agent deve ser um de: ' + agentNames.join(', '));
  }
  return value;
}

function toHtml(value: string) {
  return `<p>${escapeHtml(value).replace(/\n/g, '<br>')}</p>`;
}

function cleanSummary(raw: string | undefined): string {
  if (!raw) return '';
  const marker = raw.lastIndexOf('--- RESUMO DA ENTREGA ---');
  const base = marker >= 0 ? raw.slice(marker + 25) : raw;

  const lines = base.split('\n');
  const filtered: string[] = [];
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

function formatChangelog(files: string[]): string {
  if (!files || files.length === 0) return '';

  const list = files.map((file) => {
    const trimmed = file.trim();
    const status = trimmed.slice(0, 2).trim();
    const filePath = trimmed.slice(2).trim();

    let prefix = 'Modificado';
    if (status === 'A' || status === '??') prefix = 'Novo';
    else if (status === 'D') prefix = 'Removido';

    return `<li><strong>[${prefix}]</strong> <code>${escapeHtml(filePath)}</code></li>`;
  });

  return `<p><strong>Changelog de arquivos:</strong></p><ul>${list.join('')}</ul>`;
}

// O comentário é exibido como HTML no painel, então tudo que vem do agente é escapado
function finishedComment(data: any) {
  let result = data.stopped ? 'Execução parada pelo usuário.' : '';
  if (data.exitCode === 0 && data.agent === 'antigravity') {
    result = 'Revisão de código concluída.';
  }
  const summary = cleanSummary(text(data.summary, 4000));
  const files = Array.isArray(data.touchedFiles) ? data.touchedFiles.slice(0, 50).map((file: unknown) => text(file) || '') : [];

  let html = '';
  if (result) html += `<p>${result}</p>`;
  if (summary) html += `<p>${escapeHtml(summary).replace(/\n/g, '<br>')}</p>`;
  if (files.length > 0) {
    html += formatChangelog(files);
  }
  return html || '<p>Tarefa concluída sem comentários adicionais.</p>';
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
