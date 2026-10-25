import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import type * as Updater from './updater.ts';

/** Run the real updater with a fake Electron host; tests never launch an installer. */
function host(options: { packaged?: boolean; platform?: string; persisted?: Record<string, unknown> } = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'coco-updater-'));
  if (options.persisted) writeFileSync(path.join(directory, 'updater.json'), JSON.stringify(options.persisted));
  const installer = Buffer.from('test installer');
  const digest = createHash('sha256').update(installer).digest('hex');
  const repo = 'https://github.com/markcxx/cocomusic';
  const urls: string[] = [];
  const opened: string[] = [];
  const external: string[] = [];
  let corrupt = false;
  const events = new Map<string, () => void>();
  const scheduled: Array<() => void> = [];
  const installs: string[] = [];
  const app = { isPackaged: options.packaged ?? false, getVersion: () => options.packaged ? '0.0.0' : '0.0.1', getPath: () => directory, on(event: string, handler: () => void) { events.set(event, handler); } };
  const electron = {
    app, BrowserWindow: { getAllWindows: () => [] },
    net: { fetch: async (url: string) => {
      urls.push(url);
      if (url.startsWith('https://api.github.com/')) return Response.json([{
        tag_name: 'v0.0.1', name: '0.0.1', html_url: `${repo}/releases/tag/v0.0.1`, body: 'Release notes',
        assets: ['mac-arm64.zip', 'mac-arm64.dmg', 'win-x64-Setup.exe'].map(suffix => ({
          name: `CoCo-Music-0.0.1-${suffix}`, size: installer.length, state: 'uploaded', digest: `sha256:${digest}`,
          browser_download_url: `${repo}/releases/download/v0.0.1/CoCo-Music-0.0.1-${suffix}`,
        })),
      }]);
      return new Response(corrupt ? Buffer.from('corrupt') : installer);
    } },
    shell: { openExternal: async (url: string) => { external.push(url); }, openPath: async (file: string) => { opened.push(file); return ''; }, showItemInFolder() {} },
  };
  const require = createRequire(import.meta.url);
  const requireHost = (name: string) => {
    if (name === 'electron') return electron;
    if (name === 'node:child_process') return { ...require(name), spawn: (file: string) => { installs.push(file); return { unref() {} }; } };
    if (name === './update-core' || name === './update-download' || name === '../shared/ipc') return require(`${name}.ts`);
    return require(name);
  };
  const js = ts.transpileModule(readFileSync(new URL('./updater.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const loadedModule = { exports: {} };
  const inertTimer = () => ({ unref() {} });
  const run = new vm.Script(`(function(require, module, exports) { ${js}\n})`).runInNewContext({
    process: { ...process, platform: options.platform ?? 'darwin', arch: 'arm64', execPath: '/tmp/Electron.app/Contents/MacOS/Electron', env: { COCO_FAKE_VERSION: '0.0.0' } },
    setTimeout: (callback: () => void) => { scheduled.push(callback); return inertTimer(); }, setInterval: inertTimer, clearInterval() {}, AbortController, AbortSignal, Buffer,
  });
  run(requireHost, loadedModule, loadedModule.exports);
  const updater = loadedModule.exports as typeof Updater;
  updater.setupUpdater();
  return { updater, directory, urls, opened, external, events, scheduled, installs, corrupt: () => { corrupt = true; }, repair: () => { corrupt = false; }, dispose: () => rmSync(directory, { recursive: true, force: true }) };
}

test('development check → download → open installer stays inside the app until installation', async () => {
  const context = host();
  const { updater } = context;
  try {
    await updater.checkForUpdates();
    assert.equal(updater.getUpdateState().status, 'available');
    assert.equal(Object.hasOwn(updater.getUpdateState().settings, 'autoDownload'), false);
    assert.equal(updater.getUpdateState().install, 'open');
    assert.match(updater.getUpdateState().update!.file, /\.dmg$/);
    await updater.downloadUpdate();
    assert.equal(updater.getUpdateState().status, 'ready');
    assert.equal(context.opened.length, 0);
    assert.equal(context.external.length, 0);
    assert.ok(context.urls.some(url => url.endsWith('.dmg')));
    assert.ok(!context.urls.some(url => url.endsWith('.zip')));
    await updater.installUpdate();
    assert.equal(context.opened.length, 1);
    assert.ok(context.opened[0].startsWith(context.directory));
    assert.equal(context.external.length, 0);
  } finally { context.dispose(); }
});

test('install before download downloads locally; checksum errors can be retried without opening Releases', async () => {
  const context = host();
  try {
    await context.updater.checkForUpdates();
    context.corrupt();
    await context.updater.installUpdate();
    assert.equal(context.updater.getUpdateState().status, 'error');
    assert.match(context.updater.getUpdateState().error, /校验失败/);
    assert.equal(context.external.length, 0);
    assert.equal(context.opened.length, 0);
    context.repair();
    await context.updater.downloadUpdate();
    assert.equal(context.updater.getUpdateState().status, 'ready');
  } finally { context.dispose(); }
});


test('clicking download while a manual check is pending downloads the offered version', async () => {
  const context = host();
  try {
    await Promise.all([context.updater.checkForUpdates(), context.updater.downloadUpdate()]);
    assert.equal(context.updater.getUpdateState().status, 'ready');
    assert.equal(context.external.length, 0);
  } finally { context.dispose(); }
});


test('startup prompts before downloading even with legacy autoDownload=true, and quit never installs', async () => {
  const context = host({ packaged: true, platform: 'win32', persisted: { autoCheck: true, autoDownload: true, channel: 'stable' } });
  try {
    assert.equal(Object.hasOwn(JSON.parse(readFileSync(path.join(context.directory, 'updater.json'), 'utf8')), 'autoDownload'), false);
    context.scheduled[0](); // The real startup-check callback.
    await context.updater.checkForUpdates(true);
    assert.equal(context.updater.getUpdateState().status, 'available');
    assert.equal(context.updater.getUpdateState().notify, '0.0.1');
    assert.equal(context.urls.filter(url => !url.startsWith('https://api.github.com/')).length, 0);
    context.updater.setUpdateSettings({ autoDownload: true }); // Old renderer / IPC cannot enable it again.
    await context.updater.checkForUpdates(true);
    assert.equal(context.updater.getUpdateState().status, 'available');
    await context.updater.downloadUpdate(); // Only the explicit download action fetches an installer.
    assert.equal(context.updater.getUpdateState().status, 'ready');
    context.events.get('will-quit')!();
    assert.equal(context.installs.length, 0);
    assert.equal(context.opened.length, 0);
  } finally { context.dispose(); }
});

test('skipping a version suppresses the prompt across restarts and automatic checks never fetch installers', async () => {
  const context = host();
  try {
    await context.updater.checkForUpdates(true);
    assert.equal(context.updater.getUpdateState().notify, '0.0.1');
    context.updater.skipVersion('0.0.1');
    await context.updater.checkForUpdates(true);
    assert.equal(context.updater.getUpdateState().notify, '');
    const restarted = host({ persisted: JSON.parse(readFileSync(path.join(context.directory, 'updater.json'), 'utf8')) });
    try {
      await restarted.updater.checkForUpdates(true);
      assert.equal(restarted.updater.getUpdateState().notify, '');
      assert.equal(restarted.urls.length, 1);
    } finally { restarted.dispose(); }
  } finally { context.dispose(); }
});

test('a previous manual check does not swallow the automatic update prompt; dismiss prompts only once per session', async () => {
  const context = host();
  try {
    await context.updater.checkForUpdates();
    assert.equal(context.updater.getUpdateState().notify, '');
    await context.updater.checkForUpdates(true);
    assert.equal(context.updater.getUpdateState().notify, '0.0.1');
    context.updater.dismiss('notify');
    await context.updater.checkForUpdates(true);
    assert.equal(context.updater.getUpdateState().notify, '');
    assert.equal(context.urls.filter(url => !url.startsWith('https://api.github.com/')).length, 0);
  } finally { context.dispose(); }
});
