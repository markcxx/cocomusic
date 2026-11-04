import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { app, BrowserWindow, Menu, screen } from 'electron';
import { IPC } from '../shared/ipc';
import type { MenuAction, PlayerState } from './system-menu';
import { parseTaskbarProbe, retainTaskbarProbe, resolveTaskbarSlot, type TaskbarProbe } from './taskbar-lyrics-layout';

/** A small taskbar surface. Geometry is queried outside Electron's UI thread. */
export function setupTaskbarLyrics(main: BrowserWindow, origin: string, preload: string, action: (value: MenuAction) => void) {
  if (process.platform !== 'win32') return undefined;
  let window: BrowserWindow | undefined;
  let worker: ChildProcess | undefined;
  let probe: TaskbarProbe | null = null;
  let state: PlayerState | undefined;
  let ready = false;
  let quitting = false;
  let retry: NodeJS.Timeout | undefined;
  let watchdog: NodeJS.Timeout | undefined;
  let lastPacket = 0;
  let lastBounds = '';
  let lastValidAt = 0;
  let lastForeground = '';
  let lastRaisedAt = 0;
  let menuOpen = false;
  const alive = () => Boolean(window && !window.isDestroyed());
  const send = () => { if (alive() && state) window!.webContents.send(IPC.trayState, { ...state, taskbarDark: probe?.dark ?? false, platform: 'win32' }); };
  const present = () => {
    if (!alive()) return;
    const slot = state?.taskbarLyrics && state.hasTrack && !main.isDestroyed() && !main.isFullScreen()
      ? resolveTaskbarSlot(probe, state.taskbarWidth, state.taskbarPosition) : null;
    if (!slot || !ready) { if (window!.isVisible()) window!.hide(); return; }
    const bounds = screen.screenToDipRect(null, slot);
    const key = JSON.stringify(bounds);
    if (key !== lastBounds) { lastBounds = key; window!.setBounds(bounds, false); }
    const foreground = probe?.foreground ?? '';
    const needsRaise = !window!.isVisible() || foreground !== lastForeground || Date.now() - lastRaisedAt > 2000;
    if (!window!.isVisible()) window!.showInactive();
    if (needsRaise && !menuOpen) {
      // Windows can place Explorer above an already-visible topmost window
      // after app activation. Restore z-order without activating the lyric.
      window!.setAlwaysOnTop(true, 'pop-up-menu');
      window!.moveTop();
      lastRaisedAt = Date.now(); lastForeground = foreground;
    }
    send();
  };
  const stopWorker = () => {
    clearTimeout(retry); retry = undefined;
    clearInterval(watchdog); watchdog = undefined;
    const previous = worker; worker = undefined;
    previous?.kill();
    probe = null;
  };
  const startWorker = () => {
    if (worker || retry || quitting || !state?.taskbarLyrics) return;
    const script = app.isPackaged ? path.join(process.resourcesPath, 'windows', 'taskbar-layout.ps1') : path.join(app.getAppPath(), 'build', 'windows', 'taskbar-layout.ps1');
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    worker = child;
    lastPacket = Date.now();
    let buffer = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      if (worker !== child) return;
      buffer += chunk;
      if (buffer.length > 512_000) { buffer = ''; probe = null; present(); return; }
      const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
      for (const line of lines) {
        try {
          const raw: unknown = JSON.parse(line.trim());
          const now = Date.now();
          const parsed = parseTaskbarProbe(raw);
          probe = parsed ?? retainTaskbarProbe(probe, raw, lastValidAt, now);
          if (parsed) lastValidAt = now;
          lastPacket = now;
        } catch { /* Wait for another complete packet instead of blinking. */ }
      }
      present();
    });
    const ended = () => {
      if (worker !== child) return;
      worker = undefined; probe = null;
      clearInterval(watchdog); watchdog = undefined;
      present();
      if (!quitting && state?.taskbarLyrics) retry = setTimeout(() => { retry = undefined; startWorker(); }, 1500);
    };
    child.on('error', ended);
    child.on('exit', ended);
    watchdog = setInterval(() => {
      if (Date.now() - lastPacket > 6000) { probe = null; present(); child.kill(); }
    }, 1000);
  };
  const destroyWindow = () => {
    ready = false; lastBounds = '';
    const previous = window; window = undefined;
    if (previous && !previous.isDestroyed()) previous.destroy();
  };
  const ensureWindow = () => {
    if (alive() || quitting) return;
    const candidate = new BrowserWindow({
      title: 'CoCo Music 任务栏歌词', width: 340, height: 40,
      frame: false, thickFrame: false, transparent: true, backgroundColor: '#00000000',
      show: false, skipTaskbar: true, resizable: false, movable: false, hasShadow: false,
      minimizable: false, maximizable: false, fullscreenable: false, focusable: false,
      webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    window = candidate;
    candidate.setAlwaysOnTop(true, 'pop-up-menu');
    candidate.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    candidate.webContents.on('will-navigate', event => event.preventDefault());
    candidate.webContents.on('context-menu', () => {
      menuOpen = true;
      Menu.buildFromTemplate([
        { label: '打开 CoCo Music', click: () => action('show') },
        { label: '设置…', click: () => action('settings') },
        { type: 'separator' },
        { label: '关闭任务栏歌词', click: () => { if (!main.isDestroyed()) main.webContents.send(IPC.systemAction, 'taskbar-off'); } },
      ]).popup({ window: candidate, callback: () => { menuOpen = false; } });
    });
    candidate.once('ready-to-show', () => { if (window === candidate) { ready = true; send(); present(); } });
    candidate.on('closed', () => { if (window === candidate) { window = undefined; ready = false; } });
    void candidate.loadURL(`${origin}/tray/taskbar`).catch(error => {
      if (window !== candidate) return;
      console.warn('[taskbar-lyrics] Page failed to load:', error.message);
      destroyWindow();
    });
  };
  const fullscreenChanged = () => present();
  main.on('enter-full-screen', fullscreenChanged);
  main.on('leave-full-screen', fullscreenChanged);
  const dispose = () => {
    quitting = true;
    stopWorker(); destroyWindow();
    main.off('enter-full-screen', fullscreenChanged);
    main.off('leave-full-screen', fullscreenChanged);
    app.off('before-quit', dispose);
  };
  app.on('before-quit', dispose);
  return {
    update(next: PlayerState) {
      state = next;
      if (!next.taskbarLyrics) { stopWorker(); destroyWindow(); return; }
      ensureWindow(); startWorker(); send(); present();
    },
    isWindow: (value: BrowserWindow | null) => Boolean(value && alive() && window!.id === value.id),
    send,
    dispose,
  };
}
