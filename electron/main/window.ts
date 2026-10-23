import path from 'node:path';
import { app, BrowserWindow, nativeImage, session, shell } from 'electron';
import { MATERIAL_SWITCH } from '../shared/ipc';
import { initialBounds, MIN_HEIGHT, MIN_WIDTH, trackWindowState } from './window-state';

const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

/** Only http(s) links leave the app, and they open in the system browser. */
function openExternal(url: string) {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url);
}

export async function createMainWindow(origin: string, token: string) {
  const icon = nativeImage.createFromPath(app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(app.getAppPath(), 'public', 'images', 'logo.png'));
  // BrowserWindow's icon does not set the macOS Dock icon, including in development.
  app.dock?.setIcon(icon);

  // Session cookie lets the renderer proxy reject requests from other local apps or web pages.
  await session.defaultSession.cookies.set({ url: origin, name: 'coco_token', value: token, httpOnly: true, sameSite: 'strict' });

  const initial = initialBounds();
  const window = new BrowserWindow({
    ...initial.bounds,
    center: initial.bounds.x === undefined,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    title: 'CoCo Music',
    icon,
    frame: isMac,
    // 'hidden' (not 'hiddenInset') lets the traffic lights sit tight in the corner.
    titleBarStyle: isMac ? 'hidden' : undefined,
    trafficLightPosition: isMac ? { x: 14, y: 14 } : undefined,
    backgroundColor: isWindows || isMac ? '#00000000' : '#dfe2f6',
    backgroundMaterial: isWindows ? 'acrylic' : undefined,
    vibrancy: isMac ? 'under-window' : undefined,
    visualEffectState: isMac ? 'active' : undefined,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      additionalArguments: [`${MATERIAL_SWITCH}${isWindows ? 'acrylic' : isMac ? 'vibrancy' : 'none'}`],
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin === origin) return;
    event.preventDefault();
    openExternal(url);
  });

  trackWindowState(window);
  window.once('ready-to-show', () => {
    if (initial.maximized) window.maximize();
    window.show();
  });
  await window.loadURL(origin);
  return window;
}

// Mini mode: compact always-on-top window. The dedicated mini layout comes later;
// for now the regular UI shrinks and the full bounds are restored on exit.
const miniState = new WeakMap<BrowserWindow, Electron.Rectangle>();
export function toggleMini(window: BrowserWindow) {
  const previous = miniState.get(window);
  if (previous) {
    miniState.delete(window);
    window.setAlwaysOnTop(false);
    window.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);
    window.setBounds(previous, true);
    return;
  }
  if (window.isMaximized()) window.unmaximize();
  miniState.set(window, window.getBounds());
  window.setMinimumSize(360, 120);
  window.setAlwaysOnTop(true, 'floating');
  const { x, y, width } = window.getBounds();
  window.setBounds({ x: x + width - 420, y, width: 420, height: 140 }, true);
}
