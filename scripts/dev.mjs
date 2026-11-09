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
import { devElectronArgs } from './dev-electron-args.mjs';

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
// Fixed port (not random): localStorage — settings, chosen platform, queue — is per origin incl. port,
// so a new port each `npm run dev` would forget them. Override with COCO_DEV_PORT.
const DEV_PORT = Number(process.env.COCO_DEV_PORT) || 37650;
const portFree = port => new Promise(resolve => {
  const server = createServer();
  server.once('error', () => resolve(false));
  server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
});
const port = (await portFree(DEV_PORT)) ? DEV_PORT : await freePort();
if (port !== DEV_PORT) log(`端口 ${DEV_PORT} 被占用，改用 ${port}（本次不会读到之前保存的设置）`);
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
let stopping = false;
const run = (command, args, options = {}) => {
  const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', ...options });
  children.add(child);
  child.once('close', () => children.delete(child));
  child.once('error', error => { log(`无法启动子进程: ${error.message}`); shutdown(1); });
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
const { openFiles, switches } = devElectronArgs(process.argv.slice(2));
if (openFiles.length) log(`将模拟“打开方式”打开：${openFiles.join(', ')}`);
let electron;
let restarting = false;
let launches = 0;
function startElectron() {
  if (stopping) return;
  const files = launches++ === 0 ? openFiles : [];
  electron = run(electronBinary, [...switches, '.', ...files], { env: { ...env, COCO_DEV_RELOAD: '1' }, stdio: ['pipe', 'inherit', 'inherit'] });
  // The child can close stdin between a writable check and write(). EPIPE is
  // asynchronous, so guarding the write alone cannot prevent a runner crash.
  electron.stdin.on('error', error => {
    if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') log(`Electron reload pipe: ${error.message}`);
  });
  electron.once('exit', code => {
    if (stopping) return;
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
  const out = dir => { const full = path.join(root, 'dist-electron', dir); mkdirSync(full, { recursive: true }); return full; };
  // One compilation can change both main and preload. Coalesce their events:
  // restarting loads the new preload too, so it takes priority over a reload.
  let changeTimer;
  let needsRestart = false;
  const changed = main => {
    needsRestart ||= main;
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      const restart = needsRestart;
      needsRestart = false;
      if (stopping || !electron || restarting || electron.killed || electron.exitCode !== null) return;
      if (restart) {
        log('main process changed → restarting Electron');
        restarting = true;
        electron.kill();
        return;
      }
      const input = electron.stdin;
      if (!input || input.destroyed || !input.writable || input.writableEnded) return;
      log('preload changed → reloading window');
      input.write('reload\n');
    }, 250);
  };
  watch(out('main'), { recursive: true }, () => changed(true));
  watch(out('shared'), { recursive: true }, () => changed(true));
  watch(out('preload'), { recursive: true }, () => changed(false));
}

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  // Next owns a server subprocess and a dev lock. Let its shutdown handler
  // finish before exiting the runner; otherwise they can outlive the terminal.
  const closed = [...children].map(child => new Promise(resolve => {
    child.once('close', resolve);
    child.kill();
  }));
  const deadline = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
    process.exit(code);
  }, 5000);
  Promise.all(closed).then(() => { clearTimeout(deadline); process.exit(code); });
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

process.on('uncaughtException', error => { console.error(error); shutdown(1); });
process.on('unhandledRejection', error => { console.error(error); shutdown(1); });
