import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { app, utilityProcess } from 'electron';

export type NextServer = {
  origin: string;
  /** Shared secret; the renderer proxy (src/proxy.ts) rejects requests that lack it. */
  token: string;
  stop: () => void;
};

const HOST = '127.0.0.1';

/** Listen on `port` (0 = any) just to learn whether it is free; resolves the port or null. */
function probePort(port: number): Promise<number | null> {
  return new Promise(resolve => {
    const server = createServer();
    server.unref();
    server.once('error', () => resolve(null));
    server.listen(port, HOST, () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : null));
    });
  });
}

/**
 * The renderer's saved data (settings, selected platform, queue, volume, search
 * history…) lives in localStorage, which is scoped to the page origin
 * *including the port*. A new random port each launch therefore looked like a
 * fresh install. Keep one port per install: reuse the saved one, and only pick
 * (and save) a new one if it is taken.
 */
const DEFAULT_PORT = 37651;
async function stablePort() {
  const file = path.join(app.getPath('userData'), 'server-port.json');
  let saved = DEFAULT_PORT;
  try { saved = Number(JSON.parse(readFileSync(file, 'utf8')).port) || DEFAULT_PORT; } catch { /* first launch */ }
  const port = (await probePort(saved)) ?? (await probePort(0));
  if (!port) throw new Error('No free port for the renderer server');
  if (port !== saved || !existsSync(file)) {
    try { writeFileSync(file, JSON.stringify({ port })); } catch { /* best effort */ }
  }
  return port;
}

async function waitUntilReady(origin: string, token: string, timeoutMs: number, exited: () => boolean) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited()) throw new Error('Renderer server exited during startup');
    try {
      const response = await fetch(`${origin}/api/health`, { headers: { 'x-coco-token': token } });
      if (response.ok) return;
    } catch {
      // Server is not listening yet.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Renderer server did not start within ${timeoutMs / 1000}s`);
}

/** Where the Next standalone server lives: next to the app in dev, unpacked from asar when packaged. */
function standaloneServerPath() {
  const root = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return path.join(root, app.isPackaged ? 'next/standalone' : '.next/standalone', 'server.js');
}

/**
 * Start the Next.js app bound to loopback on a random port.
 * - Development: `scripts/dev.mjs` owns a long-lived `next dev` (HMR) and passes
 *   its origin/token via env, so restarting Electron for main-process edits keeps it.
 * - Production (`npm start` / packaged): runs the standalone server in an Electron utility process.
 */
export async function startNextServer(): Promise<NextServer> {
  const external = process.env.COCO_DEV_ORIGIN;
  if (external && !app.isPackaged) {
    const token = process.env.COCO_SESSION_TOKEN ?? '';
    await waitUntilReady(external, token, 120_000, () => false);
    return { origin: external, token, stop: () => undefined };
  }

  const serverFile = standaloneServerPath();
  if (!existsSync(serverFile)) throw new Error(`Missing Next.js build at ${serverFile}. Run \`npm run build\` first.`);

  const port = await stablePort();
  const token = randomBytes(32).toString('hex');
  const origin = `http://${HOST}:${port}`;
  const child = utilityProcess.fork(serverFile, [], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: HOST,
      COCO_SESSION_TOKEN: token,
      // Where the server keeps login sessions (per-user app data).
      COCO_DATA_DIR: app.getPath('userData'),
      NEXT_TELEMETRY_DISABLED: '1',
    },
    cwd: path.dirname(serverFile),
    stdio: 'inherit',
    serviceName: 'CoCo Music Server',
  });
  let exited = false;
  child.once('exit', () => { exited = true; });

  const stop = () => { if (!exited) child.kill(); };
  try {
    await waitUntilReady(origin, token, 20_000, () => exited);
  } catch (error) {
    stop();
    throw error;
  }
  return { origin, token, stop };
}
