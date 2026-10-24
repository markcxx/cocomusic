/**
 * One menu model for every system surface, so the macOS Dock menu, the
 * menu-bar / tray menu (macOS, Windows, Linux) and the app's 控制 menu stay
 * identical. Pure data (no Electron import): unit-tested, and rendered to HTML
 * by scripts/preview-system-menus.mjs to preview platforms we cannot run.
 */

export type PlayMode = 'loop' | 'shuffle' | 'one' | 'order';
export const PLAY_MODES: readonly PlayMode[] = ['loop', 'shuffle', 'one', 'order'];
export const PLAY_MODE_LABELS: Record<PlayMode, string> = { loop: '列表循环', shuffle: '随机播放', one: '单曲循环', order: '顺序播放' };

/** What the renderer reports (see SystemBridge.tsx); validated in parsePlayerState. */
export interface PlayerState {
  hasTrack: boolean;
  title: string;
  artist: string;
  playing: boolean;
  /** null: the song cannot be liked right now (logged out, other platform, local file). */
  liked: boolean | null;
  mode: PlayMode;
  /** Current synced lyric line ('' when none). */
  lyric: string;
  /** Sung fraction of that line, 0–1 (word timing when available). */
  progress: number;
  /** Fill colour of the sung part (设置 › 桌面歌词 › 歌词颜色). */
  lyricColor: string;
  /** 0–1. */
  volume: number;
  cover: string;
  /** Signed-in nickname on the current platform ('' when logged out). */
  nickname: string;
  /** 设置 › 系统: show the menu-bar / tray icon. */
  showTray: boolean;
  /** 设置 › 系统 (macOS): lyric next to the menu-bar icon. */
  trayLyrics: boolean;
  /** 设置 › 系统 (macOS): menu-bar lyric text colour; 'auto' follows the system's dark mode. */
  menuBarText: 'white' | 'black' | 'auto';
}

export const EMPTY_STATE: PlayerState = { hasTrack: false, title: '', artist: '', playing: false, liked: null, mode: 'loop', lyric: '', progress: 0, lyricColor: '#c9b4ff', volume: 0.62, cover: '', nickname: '', showTray: true, trayLyrics: true, menuBarText: 'white' };

export type MenuAction = 'show' | 'toggle' | 'previous' | 'next' | 'like' | `mode:${PlayMode}` | 'cycle-mode' | 'lyrics' | 'lyrics-lock' | 'mini' | 'settings' | 'account' | 'quit' | `volume:${number}`;

export type MenuNode =
  | { type: 'item'; label: string; action: MenuAction; enabled?: boolean; checked?: boolean; kind?: 'checkbox' | 'radio'; icon?: MenuIcon; accelerator?: string }
  | { type: 'label'; label: string }
  | { type: 'submenu'; label: string; items: MenuNode[] }
  | { type: 'separator' };

/** Small glyphs for menus that show icons (Windows / Linux tray). Files: build/tray/menu-<icon>.png. */
export type MenuIcon = 'play' | 'pause' | 'prev' | 'next' | 'heart' | 'lyrics';

/** Where the menu is shown. */
export type Surface = 'dock' | 'tray' | 'app';

export interface MenuContext {
  surface: Surface;
  desktopLyrics: boolean;
  mini: boolean;
  /** Platform: menu icons only on Windows/Linux; accelerator hints only in the app menu. */
  platform: NodeJS.Platform | string;
}

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

/** "晴天 - 周杰伦", shortened for menus. */
export function nowPlayingLabel(state: PlayerState) {
  if (!state.hasTrack) return '未在播放';
  return clip(state.artist ? `${state.title} - ${state.artist}` : state.title, 36);
}

export function buildPlayerMenu(state: PlayerState, context: MenuContext): MenuNode[] {
  const icons = context.platform !== 'darwin' && context.surface === 'tray';
  const icon = (name: MenuIcon) => (icons ? name : undefined);
  const app = context.surface === 'app';
  const items: MenuNode[] = [];

  // Tray menus lead with the way back to the window, like other players' tray menus.
  if (context.surface === 'tray') items.push({ type: 'item', label: '打开 CoCo Music', action: 'show' }, { type: 'separator' });
  if (!app) items.push({ type: 'label', label: nowPlayingLabel(state) }, { type: 'separator' });

  items.push(
    { type: 'item', label: state.playing ? '暂停' : '播放', action: 'toggle', enabled: state.hasTrack, icon: icon(state.playing ? 'pause' : 'play'), accelerator: app ? 'Space' : undefined },
    { type: 'item', label: '上一首', action: 'previous', enabled: state.hasTrack, icon: icon('prev'), accelerator: app ? 'CommandOrControl+Left' : undefined },
    { type: 'item', label: '下一首', action: 'next', enabled: state.hasTrack, icon: icon('next'), accelerator: app ? 'CommandOrControl+Right' : undefined },
    { type: 'separator' },
    { type: 'item', label: '喜欢', kind: 'checkbox', checked: state.liked === true, action: 'like', enabled: state.liked !== null, icon: icon('heart') },
    {
      type: 'submenu',
      label: `播放模式：${PLAY_MODE_LABELS[state.mode]}`,
      items: PLAY_MODES.map(mode => ({ type: 'item', label: PLAY_MODE_LABELS[mode], kind: 'radio', checked: state.mode === mode, action: `mode:${mode}` as const })),
    },
    { type: 'separator' },
    { type: 'item', label: '桌面歌词', kind: 'checkbox', checked: context.desktopLyrics, action: 'lyrics', icon: icon('lyrics') },
    { type: 'item', label: '迷你模式', kind: 'checkbox', checked: context.mini, action: 'mini' },
  );

  // The Dock adds 显示所有窗口 / 隐藏 / 退出 by itself; trays need their own.
  if (context.surface === 'tray') items.push({ type: 'separator' }, { type: 'item', label: '设置…', action: 'settings' }, { type: 'item', label: '退出 CoCo Music', action: 'quit' });
  return items;
}

/** Text next to the macOS menu-bar icon: the sung line while playing, otherwise nothing. */
export function trayTitle(state: PlayerState) {
  if (!state.trayLyrics || !state.playing || !state.hasTrack) return '';
  return clip(state.lyric || state.title, 30);
}

/** Tray tooltip (Windows/Linux show it on hover; there is no taskbar text area). */
export function trayTooltip(state: PlayerState) {
  if (!state.hasTrack) return 'CoCo Music';
  const lines = [`${state.playing ? '正在播放' : '已暂停'}：${clip(`${state.title} - ${state.artist}`, 50)}`];
  if (state.playing && state.lyric) lines.push(clip(state.lyric, 50));
  // Windows caps tray tooltips at 127 characters.
  return clip(lines.join('\n'), 127);
}

/** Everything the tray popup (src/components/tray/TrayPanel.tsx) shows. */
export interface TrayPanelState extends PlayerState {
  desktopLyrics: boolean;
  desktopLyricsLocked: boolean;
  mini: boolean;
  /** Menu-bar lyrics draw light (white) text. */
  menuBarDark: boolean;
  platform: string;
}

/** Windows taskbar right-click (jump list) tasks: re-launch with an action the running app picks up. */
export const JUMP_LIST_TASKS: Array<{ title: string; action: MenuAction; icon: MenuIcon }> = [
  { title: '播放 / 暂停', action: 'toggle', icon: 'play' },
  { title: '上一首', action: 'previous', icon: 'prev' },
  { title: '下一首', action: 'next', icon: 'next' },
  { title: '桌面歌词', action: 'lyrics', icon: 'lyrics' },
];
export const ACTION_SWITCH = '--coco-action=';

const ACTIONS = new Set<string>(['show', 'toggle', 'previous', 'next', 'like', 'cycle-mode', 'lyrics', 'lyrics-lock', 'mini', 'settings', 'account', 'quit', ...PLAY_MODES.map(mode => `mode:${mode}`)]);
export const isMenuAction = (value: unknown): value is MenuAction => typeof value === 'string'
  && (ACTIONS.has(value) || (/^volume:\d{1,3}$/.test(value) && Number(value.slice(7)) <= 100));

/** Action from a second-instance argv (jump list task), if any. */
export function actionFromArgv(argv: readonly string[]): MenuAction | null {
  const arg = argv.find(item => item.startsWith(ACTION_SWITCH));
  const value = arg?.slice(ACTION_SWITCH.length);
  return isMenuAction(value) ? value : null;
}

/** Renderer input is untrusted: keep only well-formed fields. */
export function parsePlayerState(raw: unknown): PlayerState | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const text = (field: unknown, max = 200) => (typeof field === 'string' ? field.slice(0, max) : '');
  const bool = (field: unknown, fallback: boolean) => (typeof field === 'boolean' ? field : fallback);
  return {
    hasTrack: bool(value.hasTrack, false),
    title: text(value.title),
    artist: text(value.artist),
    playing: bool(value.playing, false),
    liked: typeof value.liked === 'boolean' ? value.liked : null,
    mode: PLAY_MODES.includes(value.mode as PlayMode) ? (value.mode as PlayMode) : 'loop',
    lyric: text(value.lyric, 300),
    progress: typeof value.progress === 'number' && Number.isFinite(value.progress) ? Math.min(1, Math.max(0, value.progress)) : 0,
    lyricColor: typeof value.lyricColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.lyricColor) ? value.lyricColor : '#c9b4ff',
    volume: typeof value.volume === 'number' && Number.isFinite(value.volume) ? Math.min(1, Math.max(0, value.volume)) : 0.62,
    // Only remote https artwork (or nothing): the popup window loads it directly.
    nickname: text(value.nickname, 60),
    cover: typeof value.cover === 'string' && /^https:\/\//.test(value.cover) ? value.cover.slice(0, 1000) : '',
    showTray: bool(value.showTray, true),
    trayLyrics: bool(value.trayLyrics, true),
    menuBarText: value.menuBarText === 'black' || value.menuBarText === 'auto' ? value.menuBarText : 'white',
  };
}

/* ───────── macOS menu-bar strip geometry (MenuBarLyrics.module.css) ───────── */

/** Hover buttons: four 30pt slots. The lyric uses exactly the same area. */
export const STRIP_BUTTONS_WIDTH = 120;
export const STRIP_ICON = 22;
/** Menu-bar item in points: lyric / buttons area + app glyph on the right. */
export const STRIP_WIDTH = STRIP_BUTTONS_WIDTH + STRIP_ICON;
export const STRIP_HEIGHT = 22;

/** Which strip control a click at `x` points from the strip's left edge hit (while hovered). */
export function stripHit(x: number): 'previous' | 'toggle' | 'next' | 'like' | 'icon' | 'none' {
  if (x < 0) return 'none';
  if (x >= STRIP_BUTTONS_WIDTH) return 'icon';
  const slot = STRIP_BUTTONS_WIDTH / 4;
  return (['previous', 'toggle', 'next', 'like'] as const)[Math.min(3, Math.floor(x / slot))];
}
