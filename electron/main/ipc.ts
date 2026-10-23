import { BrowserWindow, ipcMain, type IpcMainEvent } from 'electron';
import { IPC } from '../shared/ipc';
import { toggleMini } from './window';

/**
 * Window-control IPC. Every handler checks that the sender frame is our own
 * renderer origin, so content from elsewhere can never drive the window.
 */
export function registerIpc(trustedOrigin: () => string | undefined) {
  const handle = (channel: string, action: (window: BrowserWindow) => void) => {
    ipcMain.on(channel, (event: IpcMainEvent) => {
      const origin = trustedOrigin();
      const url = event.senderFrame?.url;
      if (!origin || !url || new URL(url).origin !== origin) return;
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) action(window);
    });
  };
  handle(IPC.windowMinimize, window => window.minimize());
  handle(IPC.windowToggleMaximize, window => (window.isMaximized() ? window.unmaximize() : window.maximize()));
  handle(IPC.windowClose, window => window.close());
  handle(IPC.windowToggleMini, toggleMini);
}
