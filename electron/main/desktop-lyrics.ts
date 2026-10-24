import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, screen, type Rectangle } from 'electron';
import { IPC } from '../shared/ipc';
import { refreshSystemMenus } from './system-integration';

/**
 * Desktop lyrics: a transparent, frameless, always-on-top window that loads
 * /desktop-lyrics from the same local server. Playback state reaches it over
 * a BroadcastChannel from the main window (same origin), so main only manages
 * the window itself: visibility, bounds, and the click-through lock.
 */

const WIDTH = 820;
const HEIGHT = 150;

type State = { bounds?: Rectangle; locked: boolean; visible: boolean };
const stateFile = () => path.join(app.getPath('userData'), 'desktop-lyrics.json');

function readState(): State {
  try {
    if (existsSync(stateFile())) return { locked: false, visible: false, ...JSON.parse(readFileSync(stateFile(), 'utf8')) };
  } catch { /* fresh */ }
  return { locked: false, visible: false };
}

let state: State = { locked: false, visible: false };
let lyricsWindow: BrowserWindow | undefined;
let interactive = false;
let dragTimer: NodeJS.Timeout | undefined;
let owner: BrowserWindow | undefined;
let saveTimer: NodeJS.Timeout | undefined;

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { writeFileSync(stateFile(), JSON.stringify(state)); } catch { /* best effort */ }
  }, 300);
}

/** Saved bounds if still on a connected display; otherwise bottom-centre of the primary display. */
function initialBounds(): Rectangle {
  const saved = state.bounds;
  if (saved) {
    const area = screen.getDisplayMatching(saved).workArea;
    const visible = saved.x < area.x + area.width - 80 && saved.x + saved.width > area.x + 80 && saved.y < area.y + area.height - 40 && saved.y + saved.height > area.y + 20;
    if (visible) return saved;
  }
  const area = screen.getPrimaryDisplay().workArea;
  return { x: Math.round(area.x + (area.width - WIDTH) / 2), y: area.y + area.height - HEIGHT - 60, width: WIDTH, height: HEIGHT };
}

function notify() {
  // 桌面歌词 checkmark in the Dock / tray / app menus.
  refreshSystemMenus();
  if (owner && !owner.isDestroyed()) owner.webContents.send(IPC.desktopLyricsChanged, state.visible);
  if (lyricsWindow && !lyricsWindow.isDestroyed()) lyricsWindow.webContents.send(IPC.desktopLyricsLock, state.locked);
}

function applyLock() {
  if (!lyricsWindow || lyricsWindow.isDestroyed()) return;
  // Locked: clicks pass through to whatever is underneath. `forward` keeps
  // mousemove coming so hovering can still reveal the unlock button, and the
  // renderer briefly takes input back while the pointer is on that button.
  lyricsWindow.setIgnoreMouseEvents(state.locked && !interactive, { forward: true });
  lyricsWindow.setResizable(!state.locked);
}

function create(origin: string, preload: string) {
  const window = new BrowserWindow({
    ...initialBounds(),
    minWidth: 360,
    minHeight: 90,
    maxHeight: 320,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: true,
    alwaysOnTop: true,
    title: 'CoCo Music 桌面歌词',
    backgroundColor: '#00000000',
    webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // Above full-screen apps and the macOS menu bar, like system HUDs.
  window.setAlwaysOnTop(true, 'screen-saver');
  // Over full-screen apps too. `skipTransformProcessType` is essential: without it
  // macOS turns the whole app into a UIElement (no Dock icon, no menu bar).
  if (process.platform === 'darwin') window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  const track = () => {
    if (window.isDestroyed()) return;
    state.bounds = window.getBounds();
    save();
  };
  window.on('moved', track);
  window.on('resized', track);
  window.on('closed', () => {
    lyricsWindow = undefined;
    if (state.visible) { state.visible = false; save(); notify(); }
  });
  window.once('ready-to-show', () => { applyLock(); window.showInactive(); notify(); });
  void window.loadURL(`${origin}/desktop-lyrics`);
  return window;
}

export function setupDesktopLyrics(main: BrowserWindow, origin: string, preload: string) {
  owner = main;
  state = readState();
  if (state.visible) lyricsWindow = create(origin, preload);
  // Closing the app's main window takes the lyrics with it.
  main.on('closed', () => { lyricsWindow?.destroy(); lyricsWindow = undefined; owner = undefined; });

  return {
    set(visible: boolean | 'toggle') {
      const next = visible === 'toggle' ? !state.visible : visible;
      state.visible = next;
      save();
      if (next) {
        if (!lyricsWindow || lyricsWindow.isDestroyed()) lyricsWindow = create(origin, preload);
        else { lyricsWindow.showInactive(); notify(); }
      } else if (lyricsWindow && !lyricsWindow.isDestroyed()) {
        lyricsWindow.close();
      }
      notify();
    },
    lock(locked: boolean) {
      state.locked = locked;
      save();
      applyLock();
      notify();
    },
    setInteractive(value: boolean) {
      interactive = value;
      applyLock();
    },
    /**
     * Manual drag: follows the cursor from where the press happened. Used instead
     * of CSS drag regions, which on Windows swallow the hover events the
     * controls depend on. Ends on 'end', or by itself after 30s as a safety net.
     */
    drag(phase: 'start' | 'end') {
      clearInterval(dragTimer);
      dragTimer = undefined;
      if (phase !== 'start' || !lyricsWindow || lyricsWindow.isDestroyed() || state.locked) return;
      const window = lyricsWindow;
      const start = screen.getCursorScreenPoint();
      const origin = window.getBounds();
      const startedAt = Date.now();
      dragTimer = setInterval(() => {
        if (window.isDestroyed() || Date.now() - startedAt > 30_000) { clearInterval(dragTimer); dragTimer = undefined; return; }
        const point = screen.getCursorScreenPoint();
        window.setBounds({ ...origin, x: origin.x + point.x - start.x, y: origin.y + point.y - start.y });
      }, 16);
    },
    isLyricsWindow: (window: BrowserWindow | null) => Boolean(window && lyricsWindow && window.id === lyricsWindow.id),
    visible: () => state.visible,
    locked: () => state.locked,
  };
}

export type DesktopLyrics = ReturnType<typeof setupDesktopLyrics>;
