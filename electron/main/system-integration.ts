import path from 'node:path';
import { app, Menu, nativeImage, nativeTheme, screen, systemPreferences, Tray, type BrowserWindow, type MenuItemConstructorOptions, type NativeImage } from 'electron';
import { IPC } from '../shared/ipc';
import type { DesktopLyrics } from './desktop-lyrics';
import {
  ACTION_SWITCH, buildPlayerMenu, EMPTY_STATE, JUMP_LIST_TASKS, STRIP_WIDTH, stripHit, trayTooltip,
  type MenuAction, type MenuContext, type MenuNode, type PlayerState, type Surface, type TrayPanelState,
} from './system-menu';
import { createPanel, createStrip, destroyStrip, destroyTrayWindows, hidePanel, isPanel, isStrip, sendToPanel, sendToStrip, stripAlive, togglePanel } from './tray-windows';
import { isMini, toggleMini } from './window';

/**
 * Everything the OS shows outside the window, from one player state:
 * - macOS: Dock right-click menu, menu-bar item (lyric strip left of the icon:
 *   karaoke fill like the desktop lyrics, four buttons on hover), 控制 menu
 * - Windows: tray icon whose right-click opens our own player panel, taskbar
 *   thumbnail buttons, jump list tasks
 * - Linux: tray icon + native menu (AppIndicator cannot anchor custom popups)
 * The right-click panel is the page /tray in a small frameless window.
 */

const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

let state: PlayerState = EMPTY_STATE;
let main: BrowserWindow | undefined;
let lyrics: (() => DesktopLyrics | undefined) | undefined;
let tray: Tray | null = null;
let onAppMenu: ((items: MenuItemConstructorOptions[]) => void) | undefined;
let origin = '';
let preload = '';
let hovering = false;
const images = new Map<string, NativeImage>();

/** build/tray/* in dev; resources/tray/* when packaged (extraResources). */
function asset(name: string): NativeImage {
  const cached = images.get(name);
  if (cached) return cached;
  const root = app.isPackaged ? path.join(process.resourcesPath, 'tray') : path.join(app.getAppPath(), 'build', 'tray');
  const image = nativeImage.createFromPath(path.join(root, name));
  if (name.startsWith('trayTemplate')) image.setTemplateImage(true);
  images.set(name, image);
  return image;
}

function showWindow() {
  if (!main || main.isDestroyed()) return;
  if (main.isMinimized()) main.restore();
  main.show();
  main.focus();
}

/** Player actions run in the renderer (it owns the <audio> element and the queue). */
export function runAction(action: MenuAction) {
  if (!main || main.isDestroyed()) return;
  switch (action) {
    case 'show': hidePanel(); showWindow(); return;
    case 'quit': app.quit(); return;
    case 'lyrics': lyrics?.()?.set('toggle'); return;
    case 'lyrics-lock': { const desktop = lyrics?.(); desktop?.lock(!desktop.locked()); return; }
    case 'mini': hidePanel(); toggleMini(main); if (!main.isVisible()) main.show(); refreshSystemMenus(); return;
    case 'settings': hidePanel(); showWindow(); main.webContents.send(IPC.systemAction, 'settings'); return;
    case 'account': hidePanel(); showWindow(); main.webContents.send(IPC.systemAction, 'account'); return;
    default: main.webContents.send(IPC.systemAction, action);
  }
}

function context(surface: Surface): MenuContext {
  return { surface, desktopLyrics: Boolean(lyrics?.()?.visible()), mini: Boolean(main && !main.isDestroyed() && isMini(main)), platform: process.platform };
}

function toElectron(nodes: MenuNode[]): MenuItemConstructorOptions[] {
  return nodes.map((node): MenuItemConstructorOptions => {
    if (node.type === 'separator') return { type: 'separator' };
    if (node.type === 'label') return { label: node.label, enabled: false };
    if (node.type === 'submenu') return { label: node.label, submenu: toElectron(node.items) };
    return {
      label: node.label,
      type: node.kind ?? 'normal',
      checked: node.checked,
      enabled: node.enabled ?? true,
      accelerator: node.accelerator,
      // Accelerators in the app menu are hints only; the renderer handles the keys.
      registerAccelerator: false,
      icon: node.icon ? asset(`menu-${node.icon}.png`) : undefined,
      click: () => runAction(node.action),
    };
  });
}

/**
 * Menu-bar lyric text is white unless the user picked black. 'auto' reads the
 * *system* appearance (AppleInterfaceStyle): nativeTheme follows the app's own
 * 外观模式, which says nothing about the menu bar.
 */
function menuBarLight() {
  if (state.menuBarText === 'white') return true;
  if (state.menuBarText === 'black') return false;
  if (!isMac) return nativeTheme.shouldUseDarkColors;
  return systemPreferences.getUserDefault('AppleInterfaceStyle', 'string') === 'Dark';
}

function panelState(): TrayPanelState {
  const desktop = lyrics?.();
  return {
    ...state,
    desktopLyrics: Boolean(desktop?.visible()),
    desktopLyricsLocked: Boolean(desktop?.locked()),
    mini: Boolean(main && !main.isDestroyed() && isMini(main)),
    menuBarDark: menuBarLight(),
    platform: process.platform,
  };
}

/* ───────── Tray / menu-bar item ───────── */

/** macOS: the lyric strip replaces the plain icon while a song is loaded and 菜单栏歌词 is on. */
const wantsStrip = () => isMac && state.showTray && state.trayLyrics && state.hasTrack;

function ensureTray() {
  if (!state.showTray) { tray?.destroy(); tray = null; destroyStrip(); return; }
  if (!tray || tray.isDestroyed()) {
    tray = new Tray(isMac ? asset('trayTemplate.png') : asset('tray-color.png'));
    tray.setIgnoreDoubleClickEvents(isMac);
    tray.on('click', (_event, bounds, position) => {
      if (isWindows) { showWindow(); return; }
      if (!isMac) return;
      // Hovered strip: the four buttons; the app glyph (or a plain icon) opens the panel.
      if (stripAlive() && hovering) {
        // Hit-test with the live cursor against the item's real on-screen width: the
        // event position and the image's point size are not reliable across displays,
        // which made 暂停 land on the 下一首 slot.
        const item = tray && !tray.isDestroyed() ? tray.getBounds() : bounds;
        const cursor = screen.getCursorScreenPoint();
        const hit = stripHit(((cursor.x - item.x) / Math.max(1, item.width)) * STRIP_WIDTH);
        if (hit === 'none') return;
        if (hit !== 'icon') { runAction(hit); return; }
      }
      togglePanel(bounds, position);
    });
    tray.on('right-click', (_event, bounds) => togglePanel(bounds));
    tray.on('double-click', showWindow);
    if (isMac) {
      tray.on('mouse-enter', () => setHover(true));
      tray.on('mouse-leave', () => setHover(false));
    }
  }
  if (wantsStrip() && !stripAlive()) {
    createStrip(origin, preload, image => { if (tray && !tray.isDestroyed() && wantsStrip()) tray.setImage(image); });
  } else if (!wantsStrip() && stripAlive()) {
    destroyStrip();
    tray.setImage(asset('trayTemplate.png'));
  }
}

function setHover(value: boolean) {
  hovering = value;
  sendToStrip({ ...panelState(), hover: value });
}

function renderTray() {
  ensureTray();
  if (!tray) return;
  tray.setToolTip(trayTooltip(state));
  // Linux AppIndicator only supports native menus; Windows/macOS use our panel.
  if (!isMac && !isWindows) tray.setContextMenu(Menu.buildFromTemplate(toElectron(buildPlayerMenu(state, context('tray')))));
}

/* ───────── macOS Dock ───────── */

function renderDock() {
  if (!isMac) return;
  app.dock?.setMenu(Menu.buildFromTemplate(toElectron(buildPlayerMenu(state, context('dock')))));
}

/* ───────── Windows taskbar ───────── */

function renderThumbar() {
  if (!isWindows || !main || main.isDestroyed()) return;
  const flags = state.hasTrack ? [] : ['disabled' as const];
  main.setThumbarButtons([
    { tooltip: '上一首', icon: asset('thumb-prev.png'), flags, click: () => runAction('previous') },
    { tooltip: state.playing ? '暂停' : '播放', icon: asset(state.playing ? 'thumb-pause.png' : 'thumb-play.png'), flags, click: () => runAction('toggle') },
    { tooltip: '下一首', icon: asset('thumb-next.png'), flags, click: () => runAction('next') },
  ]);
  // Hovering the taskbar button shows the song in the thumbnail title.
  main.setThumbnailToolTip(state.hasTrack ? `${state.title} - ${state.artist}` : 'CoCo Music');
}

/** Right-click on the taskbar button: tasks start a second instance that forwards the action. */
function setupJumpList() {
  if (!isWindows) return;
  const iconRoot = app.isPackaged ? path.join(process.resourcesPath, 'tray') : path.join(app.getAppPath(), 'build', 'tray');
  // In dev the executable is electron.exe and needs the app path as its first argument.
  const prefix = app.isPackaged ? '' : `"${app.getAppPath()}" `;
  app.setUserTasks(JUMP_LIST_TASKS.map(task => ({
    program: process.execPath,
    arguments: `${prefix}${ACTION_SWITCH}${task.action}`,
    title: task.title,
    description: task.title,
    iconPath: path.join(iconRoot, `task-${task.icon}.ico`),
    iconIndex: 0,
  })));
}

/* ───────── Wiring ───────── */

let pending: NodeJS.Timeout | undefined;
let lastMenuKey = '';

/** Native menus rebuild only when something they show changed; the panel and strip get every update. */
function render() {
  pending = undefined;
  const current = panelState();
  sendToPanel(current);
  sendToStrip({ ...current, hover: hovering });
  const menuKey = JSON.stringify({ ...current, lyric: '', progress: 0, volume: 0 });
  if (menuKey === lastMenuKey) { if (tray && !tray.isDestroyed()) tray.setToolTip(trayTooltip(state)); return; }
  lastMenuKey = menuKey;
  renderTray();
  renderDock();
  renderThumbar();
  onAppMenu?.(toElectron(buildPlayerMenu(state, context('app'))));
}
const schedule = () => { if (!pending) pending = setTimeout(render, 50); };

export function setupSystemIntegration(window: BrowserWindow, options: { origin: string; preload: string; desktopLyrics: () => DesktopLyrics | undefined; appMenu: (items: MenuItemConstructorOptions[]) => void }) {
  main = window;
  origin = options.origin;
  preload = options.preload;
  lyrics = options.desktopLyrics;
  onAppMenu = options.appMenu;
  if (isMac || isWindows) createPanel(origin, preload);
  setupJumpList();
  render();
  nativeTheme.on('updated', refreshSystemMenus);
  // System dark/light switch (for 菜单栏文字颜色 = 跟随系统), independent of the app's own theme.
  if (isMac) systemPreferences.subscribeNotification('AppleInterfaceThemeChangedNotification', refreshSystemMenus);
  window.on('closed', () => { tray?.destroy(); tray = null; destroyTrayWindows(); main = undefined; });
  // Windows drops thumbnail buttons when the window is re-shown.
  window.on('show', refreshSystemMenus);
}

/** A tray page (panel or strip) is the sender. */
export const isTrayPage = (window: BrowserWindow | null) => isPanel(window) || isStrip(window);

/** Panel / strip asked for the current state (just loaded). */
export function sendTrayState(window: BrowserWindow) {
  window.webContents.send(IPC.trayState, { ...panelState(), hover: hovering });
}

/** Whether a tray / menu-bar icon is showing (a hidden window can be brought back from it). */
export const hasTray = () => Boolean(tray && !tray.isDestroyed());

/** Renderer pushed a new player state. */
export function updatePlayerState(next: PlayerState) {
  state = next;
  schedule();
}

/** Desktop lyrics / mini mode / theme changed (checkmarks and colours). */
export function refreshSystemMenus() {
  lastMenuKey = '';
  schedule();
}
