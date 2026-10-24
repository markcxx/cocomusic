// Development runner with hot reload everywhere:
//  - Next app (src/): one long-lived `next dev` (React Fast Refresh / HMR)
//  - Electron main (electron/main): `tsc --watch`; Electron restarts on change, `next dev` keeps running
//  - Preload (electron/preload): rebuilt by the same watcher; the window reloads instead of restarting
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, watch } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const log = (...parts) => console.log('\x1b[35m[cocomusic]\x1b[0m', ...parts);

const freePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const port = await freePort();
const token = randomBytes(32).toString('hex');
const origin = `http://127.0.0.1:${port}`;
// Same folder Electron's app.getPath('userData') resolves to (it uses productName), so dev and packaged share login sessions.
const appData = process.platform === 'win32' ? process.env.APPDATA
  : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support')
  : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
const userData = path.join(appData, pkg.productName || pkg.name);
const env = {
  ...process.env,
  PORT: String(port),
  HOSTNAME: '127.0.0.1',
  COCO_SESSION_TOKEN: token,
  COCO_DEV_ORIGIN: origin,
  COCO_DATA_DIR: userData,
  NEXT_TELEMETRY_DISABLED: '1',
};

const children = new Set();
const run = (command, args, options = {}) => {
  const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', ...options });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
};

// 1. Next app with HMR. COCO_WEBPACK=1 falls back from Turbopack (platforms without native SWC bindings).
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const bundler = process.env.COCO_WEBPACK ? ['--webpack'] : [];
const next = run(process.execPath, [nextBin, 'dev', '--port', String(port), '--hostname', '127.0.0.1', ...bundler]);
next.once('exit', code => { log(`next dev exited (${code})`); shutdown(code ?? 1); });

// 2. Electron main + preload compiler in watch mode.
const tscBin = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
run(process.execPath, [tscBin, '-p', 'electron/tsconfig.json', '--watch', '--preserveWatchOutput'], { stdio: ['ignore', 'pipe', 'inherit'] })
  .stdout.on('data', chunk => {
    const text = chunk.toString();
    if (/error TS/.test(text)) process.stdout.write(text);
    if (/Found 0 errors/.test(text)) firstBuild();
  });

// 3. Electron, restarted on main-process changes.
// Files after `--` simulate "open with CoCo Music": `npm run dev -- ~/Music/a.mp3`.
// They are passed on the first launch only (a restart should not replay them).
const openFiles = process.argv.slice(2).filter(arg => !arg.startsWith('-')).map(arg => path.resolve(arg));
if (openFiles.length) log(`将模拟“打开方式”打开：${openFiles.join(', ')}`);
let electron;
let restarting = false;
let launches = 0;
function startElectron() {
  const files = launches++ === 0 ? openFiles : [];
  electron = run(electronBinary, ['.', ...files], { env: { ...env, COCO_DEV_RELOAD: '1' }, stdio: ['pipe', 'inherit', 'inherit'] });
  electron.once('exit', code => {
    if (restarting) { restarting = false; startElectron(); return; }
    log('Electron closed, stopping dev server');
    shutdown(code ?? 0);
  });
}

let started = false;
function firstBuild() {
  if (started) return;
  started = true;
  log(`next ${origin} (HMR) · watching electron/main and electron/preload`);
  startElectron();
  const debounce = (fn, ms = 250) => { let timer; return () => { clearTimeout(timer); timer = setTimeout(fn, ms); }; };
  const out = dir => { const full = path.join(root, 'dist-electron', dir); mkdirSync(full, { recursive: true }); return full; };
  const restart = debounce(() => {
    if (!electron || restarting) return;
    log('main process changed → restarting Electron');
    restarting = true;
    electron.kill();
  });
  watch(out('main'), { recursive: true }, restart);
  watch(out('shared'), { recursive: true }, restart);
  // Preload changes only need the page reloaded; main listens for this signal on stdin.
  watch(out('preload'), { recursive: true }, debounce(() => {
    log('preload changed → reloading window');
    electron?.stdin?.write('reload\n');
  }));
}

function shutdown(code) {
  for (const child of children) child.kill();
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
