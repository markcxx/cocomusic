import { BrowserWindow, nativeImage, nativeTheme, screen, type NativeImage, type Rectangle } from 'electron';
import { IPC } from '../shared/ipc';
import { STRIP_HEIGHT, STRIP_WIDTH } from './system-menu';

/**
 * Two small windows behind the tray icon:
 * - panel: the right-click popup (play controls, like, mode, volume, desktop
 *   lyrics, settings, quit), page /tray, shown next to the icon;
 * - strip (macOS): an offscreen page /tray/menubar that renders the lyric
 *   (karaoke fill, like the desktop lyrics) or, while hovered, four buttons.
 *   Each painted frame becomes the menu-bar icon image.
 */

export const PANEL_WIDTH = 296;


const secure = { contextIsolation: true, sandbox: true, nodeIntegration: false } as const;

/* ───────── Popup panel ───────── */

let panel: BrowserWindow | undefined;
/** Fits the full card before the page reports its real height. */
let panelHeight = 460;
let hiddenAt = 0;
/** The panel was opened above the icon (taskbar at the bottom). */
let openedAbove = true;

export function createPanel(origin: string, preload: string) {
  panel = new BrowserWindow({
    width: PANEL_WIDTH,
    height: panelHeight,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { preload, ...secure },
  });
  panel.setAlwaysOnTop(true, 'pop-up-menu');
  if (process.platform === 'darwin') panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  panel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  panel.webContents.on('will-navigate', event => event.preventDefault());
  // Like a menu: clicking anywhere else closes it.
  panel.on('blur', () => hidePanel());
  void panel.loadURL(`${origin}/tray`);
  return panel;
}

export const isPanel = (window: BrowserWindow | null) => Boolean(window && panel && !panel.isDestroyed() && window.id === panel.id);

export function resizePanel(height: number) {
  if (!panel || panel.isDestroyed() || !Number.isFinite(height)) return;
  // Below ~300 the card cannot be complete: ignore bogus reports instead of clipping it.
  if (height < 300) return;
  panelHeight = Math.round(Math.min(640, height));
  const bounds = panel.getBounds();
  if (bounds.height === panelHeight) return;
  // Keep the edge facing the tray icon fixed: above the icon (Windows taskbar) the bottom edge, below it (macOS menu bar) the top edge.
  const keepBottom = openedAbove;
  panel.setBounds({ ...bounds, height: panelHeight, y: keepBottom ? bounds.y + bounds.height - panelHeight : bounds.y });
}

/** Show next to the tray icon (`anchor` = icon bounds), flipping to stay on screen. */
export function togglePanel(anchor: Rectangle, point?: { x: number; y: number }) {
  if (!panel || panel.isDestroyed()) return;
  // The click that blurred (hid) the panel is the same one that would reopen it.
  if (panel.isVisible() || Date.now() - hiddenAt < 250) { hidePanel(); return; }
  const center = point ?? { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 };
  const area = screen.getDisplayNearestPoint(center).workArea;
  const margin = 8;
  const x = Math.round(Math.min(area.x + area.width - PANEL_WIDTH - margin, Math.max(area.x + margin, center.x - PANEL_WIDTH / 2)));
  // Taskbar at the bottom (Windows) → above the icon; menu bar at the top (macOS) → below it.
  const below = center.y < area.y + area.height / 2;
  openedAbove = !below;
  const y = Math.round(below ? Math.max(area.y + margin, anchor.y + anchor.height + 4) : Math.min(area.y + area.height - panelHeight - margin, anchor.y - panelHeight - 4));
  panel.setBounds({ x, y, width: PANEL_WIDTH, height: panelHeight });
  panel.webContents.send(IPC.trayState, { opened: Date.now() });
  panel.show();
  panel.focus();
}

export function hidePanel() {
  if (!panel || panel.isDestroyed() || !panel.isVisible()) return;
  hiddenAt = Date.now();
  panel.hide();
}

export function sendToPanel(state: unknown) {
  if (panel && !panel.isDestroyed()) panel.webContents.send(IPC.trayState, state);
}

/* ───────── macOS menu-bar lyric strip ───────── */

let strip: BrowserWindow | undefined;
let onFrame: ((image: NativeImage) => void) | undefined;

export function createStrip(origin: string, preload: string, frame: (image: NativeImage) => void) {
  onFrame = frame;
  const scaleFactor = Math.max(1, Math.round(screen.getPrimaryDisplay().scaleFactor));
  strip = new BrowserWindow({
    width: STRIP_WIDTH,
    height: STRIP_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { preload, ...secure, offscreen: { deviceScaleFactor: scaleFactor }, backgroundThrottling: false },
  });
  strip.webContents.setFrameRate(24);
  strip.webContents.on('paint', (_event, _dirty, image) => {
    if (image.isEmpty()) return;
    // Mark the bitmap as @2x so the menu bar shows it at STRIP_WIDTH points.
    onFrame?.(nativeImage.createFromBitmap(image.toBitmap(), { ...image.getSize(), scaleFactor }));
  });
  strip.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  strip.webContents.on('will-navigate', event => event.preventDefault());
  void strip.loadURL(`${origin}/tray/menubar`);
  return strip;
}

export const isStrip = (window: BrowserWindow | null) => Boolean(window && strip && !strip.isDestroyed() && window.id === strip.id);

export function sendToStrip(state: unknown) {
  if (strip && !strip.isDestroyed()) strip.webContents.send(IPC.trayState, state);
}

export function destroyStrip() {
  strip?.destroy();
  strip = undefined;
}

export const stripAlive = () => Boolean(strip && !strip.isDestroyed());

export const menuBarDark = () => nativeTheme.shouldUseDarkColors;

export function destroyTrayWindows() {
  panel?.destroy();
  panel = undefined;
  destroyStrip();
}
