import path from 'node:path';
import { BrowserWindow, nativeTheme, screen, session, shell } from 'electron';
import { IPC, MATERIAL_SWITCH } from '../shared/ipc';
import { initialBounds, MIN_HEIGHT, MIN_WIDTH, trackWindowState } from './window-state';

const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

/** Only http(s) links leave the app, and they open in the system browser. */
function openExternal(url: string) {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url);
}

export async function createMainWindow(origin: string, token: string) {
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
    frame: isMac,
    // 'hidden' (not 'hiddenInset') lets the traffic lights sit tight in the corner.
    titleBarStyle: isMac ? 'hidden' : undefined,
    trafficLightPosition: isMac ? { x: 14, y: 14 } : undefined,
    // See-through from the start on Windows/macOS so the OS material can show; the
    // renderer then applies the saved window effect (or turns it off) via setWindowMaterial.
    backgroundColor: isWindows || isMac ? '#00000000' : nativeTheme.shouldUseDarkColors ? '#15131f' : '#dfe1f5',
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

  trackWindowState(window, () => isMini(window));
  window.once('ready-to-show', () => {
    if (initial.maximized) window.maximize();
    window.show();
  });
  await window.loadURL(origin);
  return window;
}

/* ───────── Mini player ───────── */

/**
 * 设置 › 外观 › 窗口效果. The window is created see-through; the OS blurs what
 * is behind it (Windows acrylic / mica, macOS vibrancy) and the page draws its
 * own backdrop on top at the chosen window opacity. 'none' = opaque window.
 */
export type WindowEffect = 'acrylic' | 'mica' | 'vibrancy' | 'none';
const windowEffect = new WeakMap<BrowserWindow, WindowEffect>();

/** What this OS can actually do; unsupported picks fall back sensibly. */
function supported(effect: WindowEffect): WindowEffect {
  if (effect === 'none') return 'none';
  if (isMac) return 'vibrancy';
  if (isWindows) return effect === 'vibrancy' ? 'acrylic' : effect;
  return 'none';
}

export function setWindowMaterial(window: BrowserWindow, effect: WindowEffect) {
  windowEffect.set(window, supported(effect));
  if (miniState.has(window)) return; // mini mode manages its own surface; applied on exit
  applyMaterial(window, supported(effect));
}

function applyMaterial(window: BrowserWindow, effect: WindowEffect) {
  if (isWindows) window.setBackgroundMaterial(effect === 'mica' ? 'mica' : effect === 'acrylic' ? 'acrylic' : 'none');
  if (isMac) window.setVibrancy(effect === 'vibrancy' ? 'under-window' : null);
  const dark = nativeTheme.shouldUseDarkColors;
  window.setBackgroundColor(effect !== 'none' ? '#00000000' : dark ? '#15131f' : '#dfe1f5');
}

/** 设置 › 外观 › 主题: tints the OS material and native chrome to match. */
export function setColorScheme(mode: 'system' | 'light' | 'dark') {
  nativeTheme.themeSource = mode;
  for (const window of BrowserWindow.getAllWindows()) {
    const effect = windowEffect.get(window);
    if (effect && !miniState.has(window)) applyMaterial(window, effect);
  }
}

/** Compact floating bar. Width fits the mini layout; height includes the hover-expanded lyric row. */
export const MINI_WIDTH = 440;
export const MINI_HEIGHT = 96;

type MiniState = { bounds: Electron.Rectangle; maximized: boolean };
const miniState = new WeakMap<BrowserWindow, MiniState>();
/** Last mini position per window, so the bar reopens where the user left it. */
const miniPosition = new WeakMap<BrowserWindow, { x: number; y: number }>();

export function isMini(window: BrowserWindow) {
  return miniState.has(window);
}

/** Base colour of the mini capsule (MiniPlayer.module.css `.shell`). */
const MINI_SURFACE = '#241e3a';

/**
 * The main window is not created `transparent` (that would cost acrylic and
 * native resizing), so anything the page leaves unpainted shows the window
 * backing: the OS material, or white. In mini mode the backing becomes the
 * capsule's own colour and the capsule fills the window edge to edge; corner
 * rounding and shadow come from the OS (Windows 11 / macOS), so no rim appears.
 */
function setMiniSurface(window: BrowserWindow, mini: boolean) {
  if (isMac) window.setWindowButtonVisibility(!mini);
  if (!mini) { applyMaterial(window, windowEffect.get(window) ?? supported('acrylic')); return; }
  if (isWindows) window.setBackgroundMaterial('none');
  if (isMac) window.setVibrancy(null);
  window.setBackgroundColor(MINI_SURFACE);
}

/**
 * Mini mode morphs the same window into a frameless, always-on-top player bar
 * (the renderer swaps to its mini layout). Keeping one window means playback,
 * queue and the <audio> element are never interrupted.
 */
export function toggleMini(window: BrowserWindow) {
  const previous = miniState.get(window);
  if (previous) {
    miniPosition.set(window, { x: window.getBounds().x, y: window.getBounds().y });
    miniState.delete(window);
    window.setAlwaysOnTop(false);
    window.setSkipTaskbar(false);
    window.setResizable(true);
    window.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);
    setMiniSurface(window, false);
    window.setBounds(previous.bounds, true);
    if (previous.maximized) window.maximize();
    window.webContents.send(IPC.miniChanged, false);
    return;
  }

  miniState.set(window, { bounds: window.getNormalBounds(), maximized: window.isMaximized() });
  if (window.isMaximized()) window.unmaximize();
  // Tell the renderer first so the mini layout is painted before the window shrinks.
  window.webContents.send(IPC.miniChanged, true);
  window.setMinimumSize(MINI_WIDTH, MINI_HEIGHT);
  setMiniSurface(window, true);
  window.setAlwaysOnTop(true, 'floating');
  const area = screen.getDisplayMatching(window.getBounds()).workArea;
  const saved = miniPosition.get(window);
  // Default: bottom-right corner of the current display, like a desktop widget.
  const x = saved ? Math.min(Math.max(saved.x, area.x), area.x + area.width - MINI_WIDTH) : area.x + area.width - MINI_WIDTH - 24;
  const y = saved ? Math.min(Math.max(saved.y, area.y), area.y + area.height - MINI_HEIGHT) : area.y + area.height - MINI_HEIGHT - 24;
  window.setBounds({ x, y, width: MINI_WIDTH, height: MINI_HEIGHT }, true);
  window.setResizable(false);
}
