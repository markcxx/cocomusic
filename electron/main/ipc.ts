import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { AUDIO_EXTENSIONS, IPC } from '../shared/ipc';
import { getAppSettings, setAppSettings } from './app-settings';
import type { DesktopLyrics } from './desktop-lyrics';
import { handedOut, markOpenFilesReady } from './open-files';
import { setColorScheme, setWindowMaterial, toggleMini, type WindowEffect } from './window';

/** Paths the user picked through a system dialog; only these (or opened files) may be revealed. */
const picked = new Set<string>();

/**
 * Window-control and file IPC. Every handler checks that the sender frame is our
 * own renderer origin, so content from elsewhere can never drive the window or
 * reach the file system. File paths only ever come from system dialogs or the OS
 * "open with" flow, never from the renderer.
 */
export function registerIpc(trustedOrigin: () => string | undefined, lyrics: () => DesktopLyrics | undefined) {
  const trusted = (event: IpcMainEvent | IpcMainInvokeEvent) => {
    const origin = trustedOrigin();
    const url = event.senderFrame?.url;
    try { return Boolean(origin && url && new URL(url).origin === origin); } catch { return false; }
  };
  const handle = (channel: string, action: (window: BrowserWindow, ...args: unknown[]) => void) => {
    ipcMain.on(channel, (event: IpcMainEvent, ...args: unknown[]) => {
      if (!trusted(event)) return;
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) action(window, ...args);
    });
  };
  const invoke = <T>(channel: string, action: (window: BrowserWindow | null, ...args: unknown[]) => Promise<T> | T) => {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (!trusted(event)) throw new Error('Untrusted sender');
      return action(BrowserWindow.fromWebContents(event.sender), ...args);
    });
  };

  handle(IPC.windowMinimize, window => window.minimize());
  handle(IPC.windowToggleMaximize, window => (window.isMaximized() ? window.unmaximize() : window.maximize()));
  handle(IPC.windowClose, window => {
    // The lyrics window's × only hides lyrics; the app keeps running.
    if (lyrics()?.isLyricsWindow(window)) lyrics()?.set(false);
    else window.close();
  });
  handle(IPC.windowToggleMini, window => { if (!lyrics()?.isLyricsWindow(window)) toggleMini(window); });

  invoke(IPC.pickFolder, async window => {
    const options = { title: '选择音乐文件夹', properties: ['openDirectory' as const, 'createDirectory' as const] };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    const folder = result.canceled ? null : result.filePaths[0] ?? null;
    if (folder) picked.add(path.resolve(folder));
    return folder;
  });
  invoke(IPC.pickAudioFiles, async window => {
    const options = {
      title: '选择音频文件',
      properties: ['openFile' as const, 'multiSelections' as const],
      filters: [{ name: '音频文件', extensions: AUDIO_EXTENSIONS }],
    };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    const files = result.canceled ? [] : result.filePaths;
    files.forEach(file => picked.add(path.resolve(file)));
    return files;
  });
  handle(IPC.revealFile, (_window, file) => {
    if (typeof file !== 'string' || !path.isAbsolute(file)) return;
    const resolved = path.resolve(file);
    // Only reveal locations the user chose or files the OS opened with us,
    // or files inside such folders (downloads, scanned libraries).
    const allowed = handedOut.has(resolved) || picked.has(resolved) || [...picked].some(root => resolved.startsWith(root + path.sep));
    if (allowed || isInDownloads(resolved)) shell.showItemInFolder(resolved);
  });
  handle(IPC.openFilesReady, () => markOpenFilesReady());

  invoke(IPC.appGetSettings, () => getAppSettings());
  invoke(IPC.appSetSettings, (_window, patch) => (patch && typeof patch === 'object' ? setAppSettings(patch as Record<string, unknown>) : getAppSettings()));
  handle(IPC.appSetMaterial, (window, effect) => {
    const effects: WindowEffect[] = ['acrylic', 'mica', 'vibrancy', 'none'];
    if (effects.includes(effect as WindowEffect) && !lyrics()?.isLyricsWindow(window)) setWindowMaterial(window, effect as WindowEffect);
  });
  handle(IPC.appSetColorScheme, (_window, mode) => {
    if (mode === 'system' || mode === 'light' || mode === 'dark') setColorScheme(mode);
  });
  handle(IPC.appOpenDataFolder, () => { void shell.openPath(app.getPath('userData')); });

  handle(IPC.desktopLyrics, (_window, value) => {
    if (value === true || value === false || value === 'toggle') lyrics()?.set(value);
  });
  handle(IPC.desktopLyricsLock, (_window, locked) => {
    if (typeof locked === 'boolean') lyrics()?.lock(locked);
  });
  // These two only make sense from the lyrics window itself.
  handle(IPC.desktopLyricsInteractive, (window, value) => {
    if (typeof value === 'boolean' && lyrics()?.isLyricsWindow(window)) lyrics()?.setInteractive(value);
  });
  handle(IPC.desktopLyricsDrag, (window, phase) => {
    if ((phase === 'start' || phase === 'end') && lyrics()?.isLyricsWindow(window)) lyrics()?.drag(phase);
  });
}

/**
 * Download folder and library folders persisted by the server (userData/*.json)
 * stay revealable across restarts. Read fresh each time: the user may change them.
 */
function isInDownloads(file: string) {
  const roots = [path.join(os.homedir(), 'Music', 'CoCo Music')];
  const read = (name: string) => {
    try { return JSON.parse(readFileSync(path.join(app.getPath('userData'), name), 'utf8')) as Record<string, unknown>; } catch { return {}; }
  };
  const downloads = read('downloads.json').settings as { folder?: unknown } | undefined;
  if (typeof downloads?.folder === 'string') roots.push(downloads.folder);
  const library = read('library.json').folders;
  if (Array.isArray(library)) roots.push(...library.filter((item): item is string => typeof item === 'string'));
  return roots.some(root => file.startsWith(path.resolve(root) + path.sep));
}
