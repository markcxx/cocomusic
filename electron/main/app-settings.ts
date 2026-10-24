import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { app, globalShortcut, type BrowserWindow } from 'electron';
import { IPC } from '../shared/ipc';

/**
 * Settings that only the main process can apply: launch at login, what the
 * close button does, and system-wide media shortcuts. Stored in
 * userData/app-settings.json; the renderer reads/writes them over IPC.
 */

export type CloseBehavior = 'quit' | 'minimize';
export interface AppSettings {
  openAtLogin: boolean;
  closeBehavior: CloseBehavior;
  globalShortcuts: boolean;
  /**
   * 'transparent': the main window is created see-through like the desktop
   * lyrics window (the desktop shows through at the chosen opacity). Window
   * transparency is fixed at creation, so this applies after a restart.
   */
  transparentWindow: boolean;
}

// Closing keeps music playing in the background by default, like other desktop players.
const DEFAULTS: AppSettings = { openAtLogin: false, closeBehavior: 'minimize', globalShortcuts: false, transparentWindow: false };

/** Accelerators for the global shortcuts (shown in settings). */
export const GLOBAL_SHORTCUTS: Array<{ accelerator: string; action: string; label: string }> = [
  { accelerator: 'CommandOrControl+Alt+P', action: 'toggle', label: '播放 / 暂停' },
  { accelerator: 'CommandOrControl+Alt+Right', action: 'next', label: '下一首' },
  { accelerator: 'CommandOrControl+Alt+Left', action: 'previous', label: '上一首' },
  { accelerator: 'CommandOrControl+Alt+Up', action: 'volume-up', label: '音量加' },
  { accelerator: 'CommandOrControl+Alt+Down', action: 'volume-down', label: '音量减' },
  { accelerator: 'CommandOrControl+Alt+L', action: 'lyrics', label: '显示 / 隐藏桌面歌词' },
];

const file = () => path.join(app.getPath('userData'), 'app-settings.json');
let state: AppSettings = { ...DEFAULTS };
let owner: BrowserWindow | undefined;
/** Accelerators that failed to register (taken by another app). */
let conflicts: string[] = [];

function load() {
  try {
    if (existsSync(file())) {
      const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<AppSettings>;
      state = {
        openAtLogin: typeof raw.openAtLogin === 'boolean' ? raw.openAtLogin : DEFAULTS.openAtLogin,
        closeBehavior: raw.closeBehavior === 'quit' ? 'quit' : 'minimize',
        globalShortcuts: typeof raw.globalShortcuts === 'boolean' ? raw.globalShortcuts : DEFAULTS.globalShortcuts,
        transparentWindow: raw.transparentWindow === true,
      };
    }
  } catch { state = { ...DEFAULTS }; }
}

function save() {
  try { writeFileSync(file(), JSON.stringify(state)); } catch { /* best effort */ }
}

function applyShortcuts() {
  for (const item of GLOBAL_SHORTCUTS) if (globalShortcut.isRegistered(item.accelerator)) globalShortcut.unregister(item.accelerator);
  conflicts = [];
  if (!state.globalShortcuts) return;
  for (const item of GLOBAL_SHORTCUTS) {
    const ok = globalShortcut.register(item.accelerator, () => {
      if (owner && !owner.isDestroyed()) owner.webContents.send(IPC.appShortcut, item.action);
    });
    if (!ok) conflicts.push(item.accelerator);
  }
}

function applyLogin() {
  // Linux has no login-item API in Electron; the setting is hidden there.
  if (process.platform === 'linux' || !app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: state.openAtLogin });
}

/** Read before the main window exists (transparency is a construction option). */
export function loadAppSettings() {
  load();
  return state;
}
/** What the running window was created with (a changed setting waits for a restart). */
let launchedTransparent = false;
export const markLaunch = (transparent: boolean) => { launchedTransparent = transparent; };

export function setupAppSettings(main: BrowserWindow) {
  owner = main;
  applyShortcuts();
  app.on('will-quit', () => globalShortcut.unregisterAll());
}

export function getAppSettings() {
  return {
    settings: state,
    info: {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      dataDir: app.getPath('userData'),
      packaged: app.isPackaged,
      /** Launch at login only works in an installed app on macOS/Windows. */
      loginItemSupported: process.platform !== 'linux' && app.isPackaged,
      /** The current window is see-through (transparentWindow as of launch). */
      transparentWindow: launchedTransparent,
    },
    shortcuts: GLOBAL_SHORTCUTS.map(item => ({ ...item, conflict: conflicts.includes(item.accelerator) })),
  };
}

export function setAppSettings(patch: Record<string, unknown>) {
  if (typeof patch.openAtLogin === 'boolean') { state.openAtLogin = patch.openAtLogin; applyLogin(); }
  if (patch.closeBehavior === 'quit' || patch.closeBehavior === 'minimize') state.closeBehavior = patch.closeBehavior;
  if (typeof patch.globalShortcuts === 'boolean') { state.globalShortcuts = patch.globalShortcuts; applyShortcuts(); }
  if (typeof patch.transparentWindow === 'boolean') state.transparentWindow = patch.transparentWindow;
  save();
  return getAppSettings();
}

export const closeBehavior = () => state.closeBehavior;
