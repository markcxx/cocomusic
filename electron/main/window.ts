import { createRequire } from 'node:module';
import path from 'node:path';
import { BrowserWindow, nativeTheme, screen, session, shell } from 'electron';
import { IPC, MATERIAL_SWITCH } from '../shared/ipc';
import { appIcon } from './branding';
import { initialBounds, MIN_HEIGHT, MIN_WIDTH, trackWindowState } from './window-state';

const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
// This material lets more of the colours behind the window through in both appearances.
const macGlassMaterial = 'popover';

/** Only http(s) links leave the app, and they open in the system browser. */
function openExternal(url: string) {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url);
}

/**
 * Song streams and artwork come straight from the platforms' CDNs, which send
 * no (or a foreign) CORS origin. The lyrics-page visualizer reads the audio
 * samples (crossOrigin="anonymous" on the player) and samples the cover's
 * colour, so allow anonymous CORS for media and images only. Responses carry
 * no credentials either way (anonymous mode never sends cookies).
 */
function allowMediaCors(origin: string) {
  session.defaultSession.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    if ((details.resourceType !== 'media' && details.resourceType !== 'image') || details.url.startsWith(origin)) { callback({}); return; }
    const headers = Object.fromEntries(Object.entries(details.responseHeaders ?? {}).filter(([name]) => !/^access-control-allow-(origin|credentials)$/i.test(name)));
    callback({ responseHeaders: { ...headers, 'Access-Control-Allow-Origin': ['*'] } });
  });
}

export async function createMainWindow(origin: string, token: string, options: { transparent?: boolean } = {}) {
  const transparent = Boolean(options.transparent);
  // Session cookie lets the renderer proxy reject requests from other local apps or web pages.
  await session.defaultSession.cookies.set({ url: origin, name: 'coco_token', value: token, httpOnly: true, sameSite: 'strict' });
  allowMediaCors(origin);

  const initial = initialBounds();
  const window = new BrowserWindow({
    ...initial.bounds,
    center: initial.bounds.x === undefined,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    title: 'CoCo Music',
    // Taskbar / window icon on Windows and Linux (macOS uses the bundle / Dock icon).
    icon: isMac ? undefined : appIcon(),
    frame: isMac,
    // 'hidden' (not 'hiddenInset') lets the traffic lights sit tight in the corner.
    titleBarStyle: isMac ? 'hidden' : undefined,
    trafficLightPosition: isMac ? { x: 14, y: 14 } : undefined,
    // See-through from the start on Windows/macOS so the OS material can show; the
    // renderer then applies the saved window effect (or turns it off) via setWindowMaterial.
    backgroundColor: transparent || isWindows || isMac ? '#00000000' : nativeTheme.shouldUseDarkColors ? '#15131f' : '#dfe1f5',
    // 透明: a truly see-through window, like the desktop lyrics window. The page
    // draws everything, so the desktop shows through wherever it is translucent.
    transparent,
    backgroundMaterial: isWindows && !transparent ? 'acrylic' : undefined,
    vibrancy: isMac && !transparent ? macGlassMaterial : undefined,
    visualEffectState: isMac && !transparent ? 'active' : undefined,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      additionalArguments: [`${MATERIAL_SWITCH}${transparent ? 'transparent' : isWindows ? 'acrylic' : isMac ? 'vibrancy' : 'none'}`],
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

  if (transparent) {
    transparentWindows.add(window);
    window.webContents.on('render-process-gone', () => updateScenicRegions(window, 0, 0, 0));
  }
  trackWindowState(window, () => isMini(window));
  attachMiniEdgeDock(window);
  // Custom Windows/Linux controls swap the maximize ⇄ restore icon from this.
  window.on('maximize', () => window.webContents.send(IPC.maximizedChanged, true));
  window.on('unmaximize', () => window.webContents.send(IPC.maximizedChanged, false));
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
/** Windows created see-through: no OS material, the page paints everything. */
const transparentWindows = new WeakSet<BrowserWindow>();

type GlassAddon = { update: (handle: Buffer, rail: number, footer: number, strength: number) => void };
let glassAddon: GlassAddon | null | undefined;
const glassWindows = new WeakSet<BrowserWindow>();

export function updateScenicRegions(window: BrowserWindow, rail: number, footer: number, strength: number) {
  if (!isMac || window.isDestroyed() || !transparentWindows.has(window)) return;
  if (![rail, footer, strength].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) return;
  if (strength && isMini(window)) return;
  if (!strength && !glassWindows.has(window)) return;
  if (glassAddon === undefined) {
    try { glassAddon = createRequire(__filename)('../native/scenic-glass.node') as GlassAddon; }
    catch (error) {
      console.error('[scenic-glass] Native desktop materials unavailable', error);
      glassAddon = null;
    }
  }
  if (!glassAddon) return;
  glassAddon.update(window.getNativeWindowHandle(), rail, footer, strength);
  if (strength) glassWindows.add(window);
  else glassWindows.delete(window);
}

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
  if (transparentWindows.has(window)) { window.setBackgroundColor('#00000000'); return; }
  if (isWindows) window.setBackgroundMaterial(effect === 'mica' ? 'mica' : effect === 'acrylic' ? 'acrylic' : 'none');
  if (isMac) window.setVibrancy(effect === 'vibrancy' ? macGlassMaterial : null);
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
/** Edge-docked "vinyl ear" dimensions when tucked against the left/right screen edge. */
export const MINI_EAR_WIDTH = 76;
export const MINI_EAR_HEIGHT = 88;
const EDGE_SNAP_PX = 28;
const EDGE_RELEASE_PX = 52;

export type MiniDockSide = 'left' | 'right' | null;
type MiniDockInfo = { side: MiniDockSide; expanded: boolean; y: number };

type MiniState = { bounds: Electron.Rectangle; maximized: boolean };
const miniState = new WeakMap<BrowserWindow, MiniState>();
/** Last mini position per window, so the bar reopens where the user left it. */
const miniPosition = new WeakMap<BrowserWindow, { x: number; y: number }>();
const miniDock = new WeakMap<BrowserWindow, MiniDockInfo>();
const suppressMoveUntil = new WeakMap<BrowserWindow, number>();
let miniDockEnabled = true;

export function isMini(window: BrowserWindow) {
  return miniState.has(window);
}

function sendDockState(window: BrowserWindow, side: MiniDockSide, expanded: boolean) {
  if (!window.isDestroyed()) window.webContents.send(IPC.miniDockChanged, { side, expanded });
}

function applyMiniDockBounds(window: BrowserWindow, side: 'left' | 'right', expanded: boolean, targetY?: number) {
  if (window.isDestroyed() || !isMini(window)) return;
  const current = window.getBounds();
  const area = screen.getDisplayMatching(current).workArea;
  const width = expanded ? MINI_WIDTH : MINI_EAR_WIDTH;
  const height = expanded ? MINI_HEIGHT : MINI_EAR_HEIGHT;
  const rawY = targetY ?? miniDock.get(window)?.y ?? current.y;
  const y = Math.min(Math.max(rawY, area.y + 8), area.y + area.height - height - 8);
  const x = side === 'left' ? area.x : area.x + area.width - width;
  miniDock.set(window, { side, expanded, y });
  suppressMoveUntil.set(window, Date.now() + 280);
  // Send layout state before shrinking so the ear renders cleanly at narrow width.
  if (!expanded) sendDockState(window, side, false);
  window.setMinimumSize(width, height);
  window.setBounds({ x, y, width, height }, true);
  if (expanded) sendDockState(window, side, true);
}

function clearMiniDock(window: BrowserWindow, restoreSize = true) {
  const had = miniDock.get(window);
  miniDock.delete(window);
  if (!had || window.isDestroyed()) return;
  if (restoreSize && isMini(window)) window.setMinimumSize(MINI_WIDTH, MINI_HEIGHT);
  sendDockState(window, null, true);
}

/**
 * Watches mini-window moves and cursor proximity so dragging near the left/right
 * screen edge snaps into a magnetic "vinyl ear" that expands on hover and tucks
 * back when the pointer leaves (even across -webkit-app-region: drag areas).
 */
function attachMiniEdgeDock(window: BrowserWindow) {
  let moveTimer: ReturnType<typeof setTimeout> | undefined;
  let hoverTimer: ReturnType<typeof setInterval> | undefined;
  let outsideSince = 0;
  let insideSince = 0;

  const stopHoverWatch = () => {
    if (hoverTimer) { clearInterval(hoverTimer); hoverTimer = undefined; }
    outsideSince = 0;
    insideSince = 0;
  };

  const ensureHoverWatch = () => {
    if (hoverTimer) return;
    hoverTimer = setInterval(() => {
      if (window.isDestroyed() || !isMini(window) || !miniDockEnabled) { stopHoverWatch(); return; }
      const dock = miniDock.get(window);
      if (!dock?.side) { stopHoverWatch(); return; }
      const bounds = window.getBounds();
      const pt = screen.getCursorScreenPoint();
      const pad = dock.expanded ? 12 : 4;
      const inside = pt.x >= bounds.x - pad && pt.x <= bounds.x + bounds.width + pad
        && pt.y >= bounds.y - pad && pt.y <= bounds.y + bounds.height + pad;
      const now = Date.now();
      if (dock.expanded) {
        insideSince = 0;
        if (inside) { outsideSince = 0; return; }
        if (!outsideSince) { outsideSince = now; return; }
        if (now - outsideSince >= 360) {
          outsideSince = 0;
          applyMiniDockBounds(window, dock.side, false, dock.y);
        }
      } else {
        outsideSince = 0;
        if (!inside) { insideSince = 0; return; }
        if (!insideSince) { insideSince = now; return; }
        if (now - insideSince >= 70) {
          insideSince = 0;
          applyMiniDockBounds(window, dock.side, true, dock.y);
        }
      }
    }, 90);
  };

  window.on('moved', () => {
    if (!isMini(window) || !miniDockEnabled) return;
    if ((suppressMoveUntil.get(window) ?? 0) > Date.now()) return;
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (window.isDestroyed() || !isMini(window) || !miniDockEnabled) return;
      const bounds = window.getBounds();
      const area = screen.getDisplayMatching(bounds).workArea;
      const nearLeft = bounds.x - area.x <= EDGE_SNAP_PX;
      const nearRight = (area.x + area.width) - (bounds.x + bounds.width) <= EDGE_SNAP_PX;
      const currentDock = miniDock.get(window);
      if (nearLeft || nearRight) {
        const side: 'left' | 'right' = nearLeft ? 'left' : 'right';
        const pt = screen.getCursorScreenPoint();
        const cursorInside = pt.x >= bounds.x - 8 && pt.x <= bounds.x + bounds.width + 8
          && pt.y >= bounds.y - 8 && pt.y <= bounds.y + bounds.height + 8;
        applyMiniDockBounds(window, side, cursorInside, bounds.y);
        ensureHoverWatch();
      } else if (currentDock?.side) {
        const distLeft = bounds.x - area.x;
        const distRight = (area.x + area.width) - (bounds.x + bounds.width);
        if (distLeft > EDGE_RELEASE_PX && distRight > EDGE_RELEASE_PX) {
          stopHoverWatch();
          clearMiniDock(window, true);
        } else {
          // Slight vertical drag along the same edge: update docked y.
          miniDock.set(window, { ...currentDock, y: bounds.y });
        }
      }
    }, 180);
  });

  window.on('closed', () => {
    clearTimeout(moveTimer);
    stopHoverWatch();
  });

  // Expose watcher starter for explicit commands (dock-nearest / peek / collapse).
  dockWatchers.set(window, { ensureHoverWatch, stopHoverWatch });
}

const dockWatchers = new WeakMap<BrowserWindow, { ensureHoverWatch: () => void; stopHoverWatch: () => void }>();

export function handleMiniDockCommand(window: BrowserWindow, command: string) {
  if (command === 'enable') { miniDockEnabled = true; return; }
  if (command === 'disable') {
    miniDockEnabled = false;
    dockWatchers.get(window)?.stopHoverWatch();
    const dock = miniDock.get(window);
    if (dock?.side && isMini(window)) {
      const area = screen.getDisplayMatching(window.getBounds()).workArea;
      const x = dock.side === 'left' ? area.x + 16 : area.x + area.width - MINI_WIDTH - 16;
      clearMiniDock(window, true);
      suppressMoveUntil.set(window, Date.now() + 260);
      window.setBounds({ x, y: dock.y, width: MINI_WIDTH, height: MINI_HEIGHT }, true);
    }
    return;
  }
  if (!isMini(window)) return;
  const dock = miniDock.get(window);
  if (command === 'peek' && dock?.side && !dock.expanded) {
    applyMiniDockBounds(window, dock.side, true, dock.y);
    dockWatchers.get(window)?.ensureHoverWatch();
  } else if (command === 'collapse' && dock?.side && dock.expanded) {
    applyMiniDockBounds(window, dock.side, false, dock.y);
    dockWatchers.get(window)?.ensureHoverWatch();
  } else if (command === 'dock-nearest' && miniDockEnabled) {
    const bounds = window.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const center = bounds.x + bounds.width / 2;
    const side: 'left' | 'right' = center < area.x + area.width / 2 ? 'left' : 'right';
    applyMiniDockBounds(window, side, false, bounds.y);
    dockWatchers.get(window)?.ensureHoverWatch();
  } else if (command === 'undock' && dock?.side) {
    dockWatchers.get(window)?.stopHoverWatch();
    const area = screen.getDisplayMatching(window.getBounds()).workArea;
    const x = dock.side === 'left' ? area.x + 24 : area.x + area.width - MINI_WIDTH - 24;
    clearMiniDock(window, true);
    suppressMoveUntil.set(window, Date.now() + 260);
    window.setBounds({ x, y: dock.y, width: MINI_WIDTH, height: MINI_HEIGHT }, true);
  }
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
    const dock = miniDock.get(window);
    dockWatchers.get(window)?.stopHoverWatch();
    if (!dock?.side) miniPosition.set(window, { x: window.getBounds().x, y: window.getBounds().y });
    clearMiniDock(window, false);
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

  updateScenicRegions(window, 0, 0, 0);
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
