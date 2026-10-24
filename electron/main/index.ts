import path from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';
import { applyBranding, onOpenSettings, setControlMenu } from './branding';
import { actionFromArgv } from './system-menu';
import { hasTray, runAction, setupSystemIntegration } from './system-integration';
import { closeBehavior, loadAppSettings, markLaunch, setupAppSettings } from './app-settings';
import { setupDesktopLyrics, type DesktopLyrics } from './desktop-lyrics';
import { registerIpc } from './ipc';
import { startNextServer, type NextServer } from './next-server';
import { attachOpenFilesWindow, audioFilesFromArgv, queueOpenFiles, registerOpenFileHandlers } from './open-files';
import { createMainWindow } from './window';

let server: NextServer | undefined;
let mainWindow: BrowserWindow | undefined;
let lyrics: DesktopLyrics | undefined;
/** Set on a real quit (menu, Cmd+Q, system shutdown) so "close to background" lets the window go. */
let quitting = false;
app.on('before-quit', () => { quitting = true; });

// Name before ready: menus, userData folder and the macOS app menu use it (in dev the binary is Electron).
app.setName('CoCo Music');

if (!app.requestSingleInstanceLock()) app.quit();

// Before ready: macOS delivers "open with" files as early `open-file` events.
registerOpenFileHandlers();

// Dev runner (scripts/dev.mjs) asks for a window reload after preload rebuilds.
if (process.env.COCO_DEV_RELOAD && process.stdin) {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (String(chunk).includes('reload')) for (const window of BrowserWindow.getAllWindows()) window.webContents.reloadIgnoringCache();
  });
}

// Windows/Linux: opening a file while the app runs starts a second instance with
// the path in argv; it exits immediately and the paths arrive here.
app.on('second-instance', (_event, argv, workingDirectory) => {
  // Windows jump list tasks (taskbar right-click) relaunch the app with --coco-action=…
  const action = actionFromArgv(argv);
  if (action) { runAction(action); return; }
  queueOpenFiles(audioFilesFromArgv(argv, workingDirectory));
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  // Always a regular app on macOS: Dock icon + menu bar (guards against anything
  // that switched the process to an accessory/UIElement app).
  if (process.platform === 'darwin') {
    app.setActivationPolicy('regular');
    void app.dock?.show();
  }
  applyBranding();
  registerIpc(() => server?.origin, () => lyrics);
  try {
    server = await startNextServer();
    // 设置 › 外观 › 窗口效果 = 透明 is a construction option: read it before creating the window.
    const transparent = loadAppSettings().transparentWindow;
    markLaunch(transparent);
    mainWindow = await createMainWindow(server.origin, server.token, { transparent });
    attachOpenFilesWindow(mainWindow);
    lyrics = setupDesktopLyrics(mainWindow, server.origin, path.join(__dirname, '..', 'preload', 'index.js'));
    setupAppSettings(mainWindow);
    setupSystemIntegration(mainWindow, { origin: server.origin, preload: path.join(__dirname, '..', 'preload', 'index.js'), desktopLyrics: () => lyrics, appMenu: setControlMenu });
    onOpenSettings(() => runAction('settings'));
    const window = mainWindow;
    // 设置 › 系统 › 关闭主窗口: keep playing in the background instead of quitting.
    window.on('close', event => {
      if (quitting || closeBehavior() !== 'minimize') return;
      event.preventDefault();
      // Keep playing in the background: the Dock (macOS) or the tray icon brings it back.
      // Without a tray icon on Windows/Linux a hidden window would be unreachable: minimize instead.
      if (process.platform === 'darwin' || hasTray()) window.hide(); else window.minimize();
    });
    mainWindow.on('closed', () => { mainWindow = undefined; });
  } catch (error) {
    dialog.showErrorBox('CoCo Music 启动失败', error instanceof Error ? error.message : String(error));
    app.quit();
  }
});

// macOS: clicking the dock icon brings a hidden main window back.
app.on('activate', () => { mainWindow?.show(); });

// The desktop lyrics window alone must not keep the app alive.
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => server?.stop());
