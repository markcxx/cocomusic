import { app, BrowserWindow, dialog } from 'electron';
import { registerIpc } from './ipc';
import { startNextServer, type NextServer } from './next-server';
import { createMainWindow } from './window';

let server: NextServer | undefined;
let mainWindow: BrowserWindow | undefined;

if (!app.requestSingleInstanceLock()) app.quit();

// Dev runner (scripts/dev.mjs) asks for a window reload after preload rebuilds.
if (process.env.COCO_DEV_RELOAD && process.stdin) {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (String(chunk).includes('reload')) for (const window of BrowserWindow.getAllWindows()) window.webContents.reloadIgnoringCache();
  });
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  registerIpc(() => server?.origin);
  try {
    server = await startNextServer();
    mainWindow = await createMainWindow(server.origin, server.token);
  } catch (error) {
    dialog.showErrorBox('CoCo Music 启动失败', error instanceof Error ? error.message : String(error));
    app.quit();
  }
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => server?.stop());
