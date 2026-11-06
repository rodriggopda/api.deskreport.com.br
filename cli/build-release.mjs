// Gera os pacotes do deskreport-client para Linux, macOS e Windows
// Saída: ../deskreport.com.br/public/downloads/deskreport-linux.tar.gz, deskreport-macos.tar.gz e deskreport-windows-x64.tar.gz
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cliDir = fileURLToPath(new URL('.', import.meta.url));
const webPublic = path.resolve(cliDir, '../../deskreport.com.br/public');
const outDir = path.join(webPublic, 'downloads');
const apiPackage = JSON.parse(readFileSync(path.resolve(cliDir, '../package.json'), 'utf8'));

const packageJson = {
  name: 'deskreport-client',
  version: apiPackage.version,
  private: true,
  type: 'module',
  dependencies: { 'socket.io-client': apiPackage.dependencies['socket.io-client'] },
};

// O app aberto pelo menu (Linux) ou pelo Finder (macOS) não herda o PATH do terminal, então procura o node
const unixLauncher = `#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="node"
if ! command -v node >/dev/null 2>&1; then
  for d in /opt/homebrew/bin /usr/local/bin "$HOME"/.nvm/versions/node/*/bin "$HOME"/.local/share/nvm/*/bin "$HOME"/.fnm/current/bin "$HOME"/.volta/bin; do
    if [ -x "$d/node" ]; then NODE="$d/node"; break; fi
  done
fi
exec "$NODE" "$DIR/deskreport-client.mjs" "$@"
`;

// Windows já vem com tar para extrair e o .cmd roda o client com o node do PATH
// O .vbs abre o app do widget sem mostrar janela de terminal
const windowsLauncher = '@echo off\r\nnode "%~dp0deskreport-client.mjs" %*\r\n';
const windowsWidget = 'Set fso = CreateObject("Scripting.FileSystemObject")\r\ndir = fso.GetParentFolderName(WScript.ScriptFullName)\r\nCreateObject("WScript.Shell").Run "node """ & dir & "\\deskreport-client.mjs"" widget", 0, False\r\n';

mkdirSync(outDir, { recursive: true });
buildPackage('deskreport-linux.tar.gz', 'install.sh', { deskreport: unixLauncher });
buildPackage('deskreport-macos.tar.gz', 'install.sh', { deskreport: unixLauncher });
buildPackage('deskreport-windows-x64.tar.gz', 'install.ps1', { 'deskreport.cmd': windowsLauncher, 'DeskReport.vbs': windowsWidget });

function buildPackage(fileName, installer, launchers) {
  const staging = mkdtempSync(path.join(os.tmpdir(), 'deskreport-'));

  copyFileSync(path.join(cliDir, 'deskreport-client.mjs'), path.join(staging, 'deskreport-client.mjs'));
  copyFileSync(path.join(webPublic, installer), path.join(staging, installer));
  copyFileSync(path.join(webPublic, 'deskreport-simbol.svg'), path.join(staging, 'icon.svg'));
  copyFileSync(path.join(webPublic, 'deskreport-icon.png'), path.join(staging, 'icon.png'));
  writeFileSync(path.join(staging, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n');
  chmodSync(path.join(staging, installer), 0o755);

  for (const [name, content] of Object.entries(launchers)) {
    writeFileSync(path.join(staging, name), content, { mode: 0o755 });
  }

  const target = path.join(outDir, fileName);
  execFileSync('tar', ['-czf', target, '-C', staging, '.']);
  rmSync(staging, { recursive: true, force: true });
  console.log(`Gerado ${target}`);
}
