import { contextBridge, ipcRenderer, webUtils } from 'electron';

// Sandboxed preloads can only require 'electron' and a few Node built-ins, not
// local modules, so this file must stay self-contained. Keep these values in
// sync with electron/shared/ipc.ts (main process side).
const IPC = {
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowToggleMini: 'window:toggle-mini',
  miniChanged: 'window:mini-changed',
  maximizedChanged: 'window:maximized-changed',
  windowIsMaximized: 'window:is-maximized',
  pickFolder: 'files:pick-folder',
  pickAudioFiles: 'files:pick-audio',
  revealFile: 'files:reveal',
  openFiles: 'files:open',
  openFilesReady: 'files:ready',
  desktopLyrics: 'lyrics:desktop',
  desktopLyricsLock: 'lyrics:lock',
  desktopLyricsChanged: 'lyrics:changed',
  desktopLyricsInteractive: 'lyrics:interactive',
  desktopLyricsDrag: 'lyrics:drag',
  appGetSettings: 'app:get-settings',
  appSetSettings: 'app:set-settings',
  appSetMaterial: 'app:set-material',
  appSetColorScheme: 'app:set-color-scheme',
  appOpenDataFolder: 'app:open-data-folder',
  appShortcut: 'app:shortcut',
  systemPlayerState: 'system:player-state',
  systemAction: 'system:action',
  trayState: 'tray:state',
  trayAction: 'tray:action',
  traySize: 'tray:size',
  trayReady: 'tray:ready',
  appRelaunch: 'app:relaunch',
} as const;
const MATERIAL_SWITCH = '--coco-material=';

const material = process.argv.find(arg => arg.startsWith(MATERIAL_SWITCH))?.slice(MATERIAL_SWITCH.length) ?? 'none';

/** Subscribe to a main → renderer channel without exposing the IpcRendererEvent (it carries `sender`). */
function listen<T>(channel: string, map: (value: unknown) => T, listener: (value: T) => void) {
  const handler = (_event: unknown, value: unknown) => listener(map(value));
  ipcRenderer.on(channel, handler);
  return () => { ipcRenderer.removeListener(channel, handler); };
}
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

// Keep the bridge minimal: the renderer never receives ipcRenderer itself.
// Shape must match CocoDesktopBridge in src/types/desktop.d.ts.
contextBridge.exposeInMainWorld('coco', {
  storage: {
    getItem: (key: string): string | null => ipcRenderer.sendSync('preferences:get', key),
    setItem: (key: string, value: string) => {
      const result = ipcRenderer.sendSync('preferences:set', key, value);
      if (!result?.ok) throw new Error(result?.error ?? 'Could not save preferences');
    },
  },
  platform: process.platform,
  material,
  window: {
    minimize: () => ipcRenderer.send(IPC.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.windowToggleMaximize),
    close: () => ipcRenderer.send(IPC.windowClose),
    toggleMini: () => ipcRenderer.send(IPC.windowToggleMini),
    isMaximized: () => ipcRenderer.invoke(IPC.windowIsMaximized).then(value => value === true),
    /** Subscribe to maximize/restore; returns an unsubscribe function. */
    onMaximizeChange: (listener: (maximized: boolean) => void) => listen(IPC.maximizedChanged, value => value === true, listener),
    /** Subscribe to mini mode changes; returns an unsubscribe function. */
    onMiniChange: (listener: (mini: boolean) => void) => listen(IPC.miniChanged, value => value === true, listener),
  },
  files: {
    pickFolder: () => ipcRenderer.invoke(IPC.pickFolder) as Promise<string | null>,
    pickAudioFiles: () => ipcRenderer.invoke(IPC.pickAudioFiles).then(strings),
    reveal: (file: string) => ipcRenderer.send(IPC.revealFile, file),
    /** Absolute path of a dropped File (Electron no longer exposes File.path). */
    pathForFile: (file: File) => { try { return webUtils.getPathForFile(file) || null; } catch { return null; } },
    /** Files opened with the app. Subscribing also tells main the renderer is ready for them. */
    onOpen: (listener: (files: string[]) => void) => {
      const off = listen(IPC.openFiles, strings, listener);
      ipcRenderer.send(IPC.openFilesReady);
      return off;
    },
  },
  app: {
    getSettings: () => ipcRenderer.invoke(IPC.appGetSettings),
    setSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke(IPC.appSetSettings, patch),
    setMaterial: (effect: string) => ipcRenderer.send(IPC.appSetMaterial, effect),
    setColorScheme: (mode: string) => ipcRenderer.send(IPC.appSetColorScheme, mode),
    openDataFolder: () => ipcRenderer.send(IPC.appOpenDataFolder),
    relaunch: () => ipcRenderer.send(IPC.appRelaunch),
    onShortcut: (listener: (action: string) => void) => listen(IPC.appShortcut, value => (typeof value === 'string' ? value : ''), listener),
  },
  system: {
    /** Player state for the Dock / tray / taskbar menus. */
    setPlayerState: (state: Record<string, unknown>) => ipcRenderer.send(IPC.systemPlayerState, state),
    /** Actions picked in the Dock / tray / taskbar / app menu. */
    onAction: (listener: (action: string) => void) => listen(IPC.systemAction, value => (typeof value === 'string' ? value : ''), listener),
  },
  tray: {
    /** Tray panel / menu-bar lyrics: player state from main. Subscribing asks for the current one. */
    onState: (listener: (state: Record<string, unknown>) => void) => {
      const off = listen(IPC.trayState, value => (value && typeof value === 'object' ? value as Record<string, unknown> : {}), listener);
      ipcRenderer.send(IPC.trayReady);
      return off;
    },
    action: (action: string) => ipcRenderer.send(IPC.trayAction, action),
    resize: (height: number) => ipcRenderer.send(IPC.traySize, height),
  },
  lyrics: {
    setDesktop: (visible: boolean | 'toggle') => ipcRenderer.send(IPC.desktopLyrics, visible),
    setLocked: (locked: boolean) => ipcRenderer.send(IPC.desktopLyricsLock, locked),
    onDesktopChange: (listener: (visible: boolean) => void) => listen(IPC.desktopLyricsChanged, value => value === true, listener),
    onLockChange: (listener: (locked: boolean) => void) => listen(IPC.desktopLyricsLock, value => value === true, listener),
    setInteractive: (interactive: boolean) => ipcRenderer.send(IPC.desktopLyricsInteractive, interactive),
    drag: (phase: 'start' | 'end') => ipcRenderer.send(IPC.desktopLyricsDrag, phase),
  },
});
