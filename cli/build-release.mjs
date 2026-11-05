// Gera os pacotes do deskreport-client para Linux, macOS Apple Silicon e Windows
// Saída: ../deskreport.com.br/public/downloads/deskreport-linux.tar.gz, deskreport-macos-arm64.tar.gz e deskreport-windows-x64.tar.gz
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

const linuxLauncher = `#!/bin/sh
DIR="$(dirname "$(readlink -f "$0")")"
exec node "$DIR/deskreport-client.mjs" "$@"
`;

const macLauncher = `#!/bin/sh
DIR="$(dirname "$(readlink -f "$0")")"
NODE="node"
if [ -x /opt/homebrew/bin/node ]; then NODE="/opt/homebrew/bin/node"; fi
exec "$NODE" "$DIR/deskreport-client.mjs" "$@"
`;

const macWidget = `#!/bin/sh
exec "$HOME/.deskreport/bin/deskreport" --widget
`;

// Windows já vem com tar para extrair e o .cmd roda o client com o node do PATH
const windowsLauncher = '@echo off\r\nnode "%~dp0deskreport-client.mjs" %*\r\n';
const windowsWidget = '@echo off\r\nnode "%~dp0deskreport-client.mjs" --widget\r\n';

mkdirSync(outDir, { recursive: true });
buildPackage('deskreport-linux.tar.gz', 'install.sh', { deskreport: linuxLauncher });
buildPackage('deskreport-macos-arm64.tar.gz', 'install.sh', { deskreport: macLauncher, 'DeskReport Widget.command': macWidget });
buildPackage('deskreport-windows-x64.tar.gz', 'install.ps1', { 'deskreport.cmd': windowsLauncher, 'DeskReport Widget.cmd': windowsWidget });

function buildPackage(fileName, installer, launchers) {
  const staging = mkdtempSync(path.join(os.tmpdir(), 'deskreport-'));

  copyFileSync(path.join(cliDir, 'deskreport-client.mjs'), path.join(staging, 'deskreport-client.mjs'));
  copyFileSync(path.join(webPublic, installer), path.join(staging, installer));
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
