/**
 * IPC channel names used by the main process.
 * The sandboxed preload cannot import local modules, so electron/preload/index.ts
 * repeats these values; change both together.
 */
export const IPC = {
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowToggleMini: 'window:toggle-mini',
  /** main → renderer: window maximized (true) or restored (false). */
  maximizedChanged: 'window:maximized-changed',
  /** renderer → main (invoke): current maximized state. */
  windowIsMaximized: 'window:is-maximized',
  /** main → renderer: mini mode entered (true) or left (false). */
  miniChanged: 'window:mini-changed',

  /** renderer → main (invoke): system folder picker. Resolves to a path or null. */
  pickFolder: 'files:pick-folder',
  /** renderer → main (invoke): system file picker for audio files. Resolves to paths. */
  pickAudioFiles: 'files:pick-audio',
  /** renderer → main: reveal a file in Finder / Explorer (only paths main handed out). */
  revealFile: 'files:reveal',
  /** main → renderer: audio files opened with the app ("open with", double-click, dock drop). */
  openFiles: 'files:open',
  /** renderer → main: renderer is ready to receive openFiles (flushes the startup queue). */
  openFilesReady: 'files:ready',

  /** renderer → main: show / hide / toggle the desktop lyrics window. */
  desktopLyrics: 'lyrics:desktop',
  /** renderer → main: desktop lyrics click-through lock on/off. */
  desktopLyricsLock: 'lyrics:lock',
  /** main → renderer: desktop lyrics window shown (true) or hidden (false). */
  desktopLyricsChanged: 'lyrics:changed',
  /** lyrics window → main: pointer is over a control while locked (take mouse input back). */
  desktopLyricsInteractive: 'lyrics:interactive',
  /** lyrics window → main: 'start' / 'end' a manual window drag (drag regions swallow hover on Windows). */
  desktopLyricsDrag: 'lyrics:drag',

  /** renderer → main (invoke): read main-process settings + app info. */
  appGetSettings: 'app:get-settings',
  /** renderer → main (invoke): update main-process settings; resolves to the new settings. */
  appSetSettings: 'app:set-settings',
  /** renderer → main: window effect 'acrylic' | 'mica' | 'vibrancy' | 'none'. */
  appSetMaterial: 'app:set-material',
  /** renderer → main: colour scheme 'system' | 'light' | 'dark' (tints OS material and native UI). */
  appSetColorScheme: 'app:set-color-scheme',
  /** renderer → main: open the app's data folder in Finder / Explorer. */
  appOpenDataFolder: 'app:open-data-folder',
  /** main → renderer: a global media shortcut fired ('toggle' | 'next' | 'previous' | 'volume-up' | 'volume-down' | 'lyrics'). */
  appShortcut: 'app:shortcut',

  /** renderer → main: player state for the Dock / tray / taskbar menus (system-menu.ts PlayerState). */
  systemPlayerState: 'system:player-state',
  /** main → renderer: a Dock / tray / taskbar / menu action (system-menu.ts MenuAction). */
  systemAction: 'system:action',
  /** main → tray panel / menu-bar lyrics: TrayPanelState (system-menu.ts). */
  trayState: 'tray:state',
  /** tray panel / menu-bar lyrics → main: a MenuAction. */
  trayAction: 'tray:action',
  /** tray panel → main: rendered card height in px (the window fits it). */
  traySize: 'tray:size',
  /** tray panel / menu-bar lyrics → main: send me the current state. */
  trayReady: 'tray:ready',
  /** renderer → main: restart the app (window transparency needs a new window). */
  appRelaunch: 'app:relaunch',

  /** renderer → main (invoke): current UpdateState (updater.ts). */
  updateGetState: 'update:get-state',
  /** main → renderer: UpdateState changed. */
  updateState: 'update:state',
  /** renderer → main (invoke): check GitHub Releases now; resolves to the new UpdateState. */
  updateCheck: 'update:check',
  /** renderer → main: download the offered installer. */
  updateDownload: 'update:download',
  /** renderer → main: cancel the running download. */
  updateCancel: 'update:cancel',
  /** renderer → main: install the verified download (quits for an in-place update). */
  updateInstall: 'update:install',
  /** renderer → main: stop prompting for this version. */
  updateSkip: 'update:skip',
  /** renderer → main: the 'notify' prompt or the 'whatsNew' note was seen. */
  updateDismiss: 'update:dismiss',
  /** renderer → main (invoke): update settings (autoCheck, channel); resolves to UpdateState. */
  updateSetSettings: 'update:set-settings',
  /** renderer → main (invoke): published releases for 更新日志. */
  updateChangelog: 'update:changelog',
} as const;

/** Command-line switch carrying the window material to the preload. */
export const MATERIAL_SWITCH = '--coco-material=';

/** Extensions the app registers for and accepts from the OS (mirror of src/server/local/formats.ts). */
export const AUDIO_EXTENSIONS = ['mp3', 'flac', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'webm'];
