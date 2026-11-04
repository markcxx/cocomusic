/* eslint-disable @typescript-eslint/no-require-imports */
// Windows integration test: isolated preferences/server, real taskbar geometry,
// actual renderer, mouse input, screenshots and window cleanup. No music account.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, message, ms = 12000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return; await delay(100); }
  throw new Error(message);
}

async function run() {
  if (process.platform !== 'win32') { console.log('Windows taskbar lyric test skipped'); return; }
  const net = require('node:net');
  const token = require('node:crypto').randomBytes(32).toString('hex');
  const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const value = s.address().port; s.close(() => resolve(value)); }); });
  const origin = `http://127.0.0.1:${port}`;
  const directory = path.join(root, 'node_modules/.cache/taskbar-lyrics-smoke');
  fs.mkdirSync(directory, { recursive: true });
  const env = { ...process.env, HOSTNAME: '127.0.0.1', PORT: String(port), COCO_DATA_DIR: directory, COCO_SESSION_TOKEN: token, COCO_TASKBAR_TEST_ORIGIN: origin };
  const server = spawn(process.execPath, ['.next/standalone/server.js'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let errors = '';
  server.stderr.on('data', value => { errors = (errors + value).slice(-2000); });
  try {
    await until(async () => { try { return (await fetch(`${origin}/api/health`, { headers: { 'x-coco-token': token } })).ok; } catch { return false; } }, `Server failed: ${errors}`);
    const code = await new Promise((resolve, reject) => {
      const child = spawn(require('electron'), [__filename], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
      child.on('error', reject); child.on('exit', resolve);
    });
    assert.equal(code, 0, 'Native taskbar lyric test must pass');
  } finally { server.kill(); }
}

async function native() {
  const { app, BrowserWindow, desktopCapturer, ipcMain, screen, session } = require('electron');
  app.setName('CoCo Taskbar Test');
  app.setAppPath(root);
  app.setPath('userData', path.join(root, 'node_modules/.cache/taskbar-lyrics-smoke/electron'));
  await app.whenReady();
  const ffi = require('koffi');
  const user = ffi.load('user32.dll');
  ffi.struct('TaskbarLyricPoint', { x: 'int32_t', y: 'int32_t' });
  const hit = user.func('uintptr_t __stdcall WindowFromPoint(TaskbarLyricPoint point)');
  const ancestor = user.func('uintptr_t __stdcall GetAncestor(uintptr_t window, uint32_t flags)');
  const getForeground = user.func('uintptr_t __stdcall GetForegroundWindow()');
  const setForeground = user.func('bool __stdcall SetForegroundWindow(uintptr_t window)');
  const originalForeground = getForeground();
  const origin = process.env.COCO_TASKBAR_TEST_ORIGIN;
  await session.defaultSession.cookies.set({ url: origin, name: 'coco_token', value: process.env.COCO_SESSION_TOKEN });
  const { setupTaskbarLyrics } = require('../dist-electron/main/taskbar-lyrics');
  const { EMPTY_STATE } = require('../dist-electron/main/system-menu');
  const main = new BrowserWindow({ show: false });
  const actions = [];
  let state = { ...EMPTY_STATE, hasTrack: true, taskbarLyrics: true, title: '晴天', artist: '周杰伦', lyric: '故事的小黄花 从出生那年就飘着', lyricTranslation: '', progress: 0.48, cover: '/images/logo.svg', playing: true, liked: false };
  let prefs = JSON.stringify({ taskbarLyrics: true, taskbarWidth: 340, taskbarFontSize: 14, accent: '#9b87bf' });
  let bar;
  let foreground;
  ipcMain.on('preferences:get', (event, key) => { event.returnValue = key === 'coco:settings' ? prefs : null; });
  ipcMain.on('preferences:set', (event, key, value) => {
    if (key === 'coco:settings') { prefs = value; if (!JSON.parse(value).taskbarLyrics) bar.update({ ...state, taskbarLyrics: false }); }
    event.returnValue = { ok: true };
  });
  ipcMain.on('tray:ready', () => bar?.send());
  ipcMain.on('tray:action', (_event, action) => { actions.push(action); if (action === 'toggle') { state = { ...state, playing: !state.playing }; bar.update(state); } });
  const output = path.join(root, 'docs/screenshots');
  fs.mkdirSync(output, { recursive: true });
  try {
    bar = setupTaskbarLyrics(main, origin, path.join(root, 'dist-electron/preload/index.js'), action => actions.push(action));
    assert.ok(bar);
    bar.update(state);
    const window = BrowserWindow.getAllWindows().find(value => bar.isWindow(value));
    assert.ok(window);
    await until(() => window.isVisible(), 'Lyric window did not find a safe taskbar region');
    await until(() => window.webContents.executeJavaScript('document.body.textContent.includes("故事的小黄花")'), 'Renderer did not receive lyrics');
    await delay(350);
    const bounds = window.getBounds();
    assert.ok(bounds.width >= 168 && bounds.width <= 340 && bounds.height >= 24 && bounds.height <= 48);
    // Keep the test surface apart from a running user's lyrics. Verify the
    // default placement above, then use the other safe gap for desktop QA.
    state = { ...state, taskbarPosition: 'right' };
    bar.update(state);
    await delay(350);
    const initial = await window.webContents.executeJavaScript('(()=>{const e=document.querySelector("div[class*=capsule]");const words=document.querySelector("div[class*=words]");return {background:getComputedStyle(e).backgroundColor,radius:getComputedStyle(e).borderRadius,weight:getComputedStyle(document.querySelector("span[class*=line]")).fontWeight,x:words.getBoundingClientRect().x}})()');
    assert.equal(initial.background, 'rgba(0, 0, 0, 0)', 'Idle lyrics must have no card background');
    assert.equal(initial.radius, '5px'); assert.equal(initial.weight, '400');
    fs.writeFileSync(path.join(output, 'taskbar-lyrics-light.png'), (await window.webContents.capturePage()).toPNG());
    const display = screen.getDisplayMatching(bounds);
    const captureDesktopRegion = async filename => {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) } });
      const source = sources.find(value => value.display_id === String(display.id));
      assert.ok(source, 'Taskbar display must be capturable');
      const native = screen.dipToScreenRect(window, window.getBounds());
      const monitor = screen.dipToScreenRect(null, display.bounds);
      const image = source.thumbnail.crop({ x: native.x - monitor.x, y: native.y - monitor.y, width: native.width, height: native.height });
      fs.writeFileSync(path.join(output, filename), image.toPNG());
    };
    await captureDesktopRegion('taskbar-lyrics-desktop-idle.png');
    window.webContents.send('tray:state', { ...state, taskbarDark: true, platform: 'win32' });
    await delay(80);
    fs.writeFileSync(path.join(output, 'taskbar-lyrics-dark.png'), (await window.webContents.capturePage()).toPNG());
    window.webContents.send('tray:state', { ...state, taskbarDark: false, platform: 'win32' });
    await delay(80);
    window.webContents.sendInputEvent({ type: 'mouseMove', x: 100, y: Math.floor(bounds.height / 2) });
    await delay(70);
    const during = await window.webContents.executeJavaScript('document.querySelector("div[class*=words]").getBoundingClientRect().x');
    assert.ok(during > initial.x && during < initial.x + 112, 'Lyrics must move through intermediate positions');
    fs.writeFileSync(path.join(output, 'taskbar-lyrics-hover-transition.png'), (await window.webContents.capturePage()).toPNG());
    await delay(320);
    const expanded = await window.webContents.executeJavaScript('(()=>{const e=document.querySelector("div[class*=words]");return {x:e.getBoundingClientRect().x,opacity:getComputedStyle(e).opacity}})()');
    assert.ok(expanded.x >= initial.x + 110, 'Controls must make room by moving the lyric to the right');
    assert.equal(expanded.opacity, '1', 'Hover must keep lyrics visible');
    const button = await window.webContents.executeJavaScript('(()=>{const e=document.querySelector("button[aria-label=暂停]");const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,visible:getComputedStyle(e.parentElement).visibility}})()');
    assert.equal(button.visible, 'visible', 'Hover controls must receive mouse input');
    window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: Math.round(button.x), y: Math.round(button.y) });
    window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: Math.round(button.x), y: Math.round(button.y) });
    await until(() => actions.includes('toggle'), 'Pause button did not reach the player action channel');
    fs.writeFileSync(path.join(output, 'taskbar-lyrics-controls.png'), (await window.webContents.capturePage()).toPNG());
    await captureDesktopRegion('taskbar-lyrics-desktop-hover.png');
    const custom = { taskbarLyrics: true, taskbarCustomColors: true, taskbarTextColor: '#4b5563', taskbarHighlightColor: '#dd9b53', taskbarFontSize: 18 };
    await window.webContents.executeJavaScript(`(()=>{const c=new BroadcastChannel('coco:settings');c.postMessage({type:'settings',settings:${JSON.stringify(custom)}});setTimeout(()=>c.close(),20)})()`);
    await delay(100);
    const customColors = await window.webContents.executeJavaScript('getComputedStyle(document.querySelector("span[class*=line]")).backgroundImage');
    assert.ok(customColors.includes('rgb(75, 85, 99)'));
    assert.ok(customColors.includes('rgb(221, 155, 83)'));
    const textFit = await window.webContents.executeJavaScript('(()=>{const w=document.querySelector("div[class*=words]").getBoundingClientRect();const c=document.querySelector("div[class*=content]").getBoundingClientRect();return w.top>=c.top-0.1&&w.bottom<=c.bottom+0.1})()');
    assert.equal(textFit, true, 'The largest supported font must fit both lines without vertical clipping');
    // Real foreground transitions exercise the native fullscreen detector and
    // z-order recovery, rather than only mocking Electron's fullscreen flag.
    foreground = new BrowserWindow({ show: false, width: 420, height: 180, title: 'CoCo 任务栏歌词测试', webPreferences: { sandbox: true } });
    await foreground.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<body style="font:16px Segoe UI;padding:32px;background:#f3f1f7;color:#555">正在检查任务栏歌词的前台切换与全屏行为…</body>'));
    foreground.show(); foreground.maximize(); foreground.focus();
    for (let i = 0; i < 10; i++) {
      await delay(300);
      assert.equal(window.isVisible(), true, 'A normal maximized app must not hide taskbar lyrics');
    }
    const nativeBounds = screen.dipToScreenRect(window, window.getBounds());
    const owner = ancestor(hit({ x: nativeBounds.x + 20, y: nativeBounds.y + 20 }), 2);
    assert.equal(owner, ffi.decode(window.getNativeWindowHandle(), 'uintptr_t'), 'The lyric must actually remain above Explorer after foreground switching');
    foreground.unmaximize(); foreground.setFullScreen(true);
    await until(() => !window.isVisible(), 'A real fullscreen foreground app must hide lyrics');
    foreground.setFullScreen(false);
    await until(() => window.isVisible(), 'Lyrics must return after leaving fullscreen');
    if (getForeground() === ffi.decode(foreground.getNativeWindowHandle(), 'uintptr_t')) setForeground(originalForeground);
    foreground.destroy(); foreground = undefined;
    const isFullScreen = main.isFullScreen;
    main.isFullScreen = () => true;
    bar.update(state); assert.equal(window.isVisible(), false);
    main.isFullScreen = isFullScreen;
    bar.update(state); assert.equal(window.isVisible(), true);
    bar.update({ ...state, taskbarLyrics: false });
    assert.equal(window.isDestroyed(), true);
    // A cancelled old load must not destroy a newly enabled window.
    bar.update(state); bar.update({ ...state, taskbarLyrics: false }); bar.update(state);
    await until(() => BrowserWindow.getAllWindows().some(value => bar.isWindow(value) && value.isVisible()), 'Rapid enable/disable did not recover');
    bar.update({ ...state, taskbarLyrics: false });
    assert.equal(BrowserWindow.getAllWindows().length, 1);
    console.log(`PASS: taskbar region ${JSON.stringify(bounds)}, renderer, hover/pause IPC, custom colors, foreground/maximized z-order, real fullscreen recovery, rapid toggles and cleanup; screenshots saved.`);
  } finally {
    if (foreground && !foreground.isDestroyed()) {
      const testHandle = ffi.decode(foreground.getNativeWindowHandle(), 'uintptr_t');
      if (getForeground() === testHandle) setForeground(originalForeground);
      foreground.destroy();
    }
    bar?.dispose(); main.destroy(); app.quit();
  }
}

if (process.versions.electron) native().catch(error => { console.error(error); require('electron').app.exit(1); });
else run().catch(error => { console.error(error); process.exitCode = 1; });
