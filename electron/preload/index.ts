import { contextBridge, ipcRenderer } from 'electron';

// Sandboxed preloads can only require 'electron' and a few Node built-ins, not
// local modules, so this file must stay self-contained. Keep these values in
// sync with electron/shared/ipc.ts (main process side).
const IPC = {
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowToggleMini: 'window:toggle-mini',
} as const;
const MATERIAL_SWITCH = '--coco-material=';

const material = process.argv.find(arg => arg.startsWith(MATERIAL_SWITCH))?.slice(MATERIAL_SWITCH.length) ?? 'none';

// Keep the bridge minimal: the renderer never receives ipcRenderer itself.
// Shape must match CocoDesktopBridge in src/types/desktop.d.ts.
contextBridge.exposeInMainWorld('coco', {
  platform: process.platform,
  material,
  window: {
    minimize: () => ipcRenderer.send(IPC.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.windowToggleMaximize),
    close: () => ipcRenderer.send(IPC.windowClose),
    toggleMini: () => ipcRenderer.send(IPC.windowToggleMini),
  },
});
