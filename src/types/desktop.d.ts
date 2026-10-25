/**
 * Renderer-side view of the preload bridge (electron/preload/index.ts).
 * Optional on Window: absent when the UI is opened in a plain browser (`npm run dev:web`).
 */
interface CocoDesktopBridge {
  storage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
  platform: NodeJS.Platform;
  /** OS backdrop material behind the transparent window. */
  material: 'acrylic' | 'vibrancy' | 'transparent' | 'none';
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
    /** Maximized/restored. Returns an unsubscribe function. */
    onMaximizeChange(listener: (maximized: boolean) => void): () => void;
    /** Morph into the floating mini player bar, or restore the full window. */
    toggleMini(): void;
    /** Mini mode entered/left (main process decides). Returns an unsubscribe function. */
    onMiniChange(listener: (mini: boolean) => void): () => void;
  };
  files: {
    /** System folder picker; null when cancelled. */
    pickFolder(): Promise<string | null>;
    /** System file picker filtered to audio; empty when cancelled. */
    pickAudioFiles(): Promise<string[]>;
    /** Show a file in Finder / Explorer (only locations the user picked or downloads). */
    reveal(file: string): void;
    /** Absolute path of a File from drag & drop; null when unavailable. */
    pathForFile(file: File): string | null;
    /** Audio files opened with the app. Subscribing marks the renderer ready. */
    onOpen(listener: (files: string[]) => void): () => void;
  };
  app: {
    getSettings(): Promise<CocoAppSettingsResult>;
    setSettings(patch: Partial<CocoAppSettings>): Promise<CocoAppSettingsResult>;
    /** OS material behind the main window (unsupported values fall back per platform). */
    setMaterial(effect: 'acrylic' | 'mica' | 'vibrancy' | 'transparent' | 'none'): void;
    /** Light/dark for native chrome and the OS material tint. */
    setColorScheme(mode: 'system' | 'light' | 'dark'): void;
    openDataFolder(): void;
    /** Restart the app (applies window transparency). */
    relaunch(): void;
    /** Global media shortcut fired (only while enabled in settings). */
    onShortcut(listener: (action: 'toggle' | 'next' | 'previous' | 'volume-up' | 'volume-down' | 'lyrics' | string) => void): () => void;
  };
  system: {
    /** Player state for the Dock / tray / taskbar menus (electron/main/system-menu.ts PlayerState). */
    setPlayerState(state: CocoSystemPlayerState): void;
    /** Action picked in a Dock / tray / taskbar / app menu. */
    onAction(listener: (action: string) => void): () => void;
  };
  tray: {
    /** Tray panel / menu-bar lyrics windows only: player state (TrayPanelState). */
    onState(listener: (state: CocoTrayState) => void): () => void;
    action(action: string): void;
    resize(height: number): void;
  };
  lyrics: {
    setDesktop(visible: boolean | 'toggle'): void;
    setLocked(locked: boolean): void;
    onDesktopChange(listener: (visible: boolean) => void): () => void;
    onLockChange(listener: (locked: boolean) => void): () => void;
    /** Desktop lyrics window only: accept mouse input while locked (pointer over a control). */
    setInteractive(interactive: boolean): void;
    /** Desktop lyrics window only: move the window with the cursor until 'end'. */
    drag(phase: 'start' | 'end'): void;
  };
}

interface CocoTrayState extends CocoSystemPlayerState {
  desktopLyrics: boolean;
  desktopLyricsLocked: boolean;
  mini: boolean;
  /** Menu bar is dark (macOS menu-bar lyrics text colour). */
  menuBarDark: boolean;
  platform: string;
  /** Menu-bar strip is hovered: show the four buttons. */
  hover?: boolean;
}

interface CocoSystemPlayerState {
  hasTrack: boolean;
  title: string;
  artist: string;
  playing: boolean;
  /** null when the song cannot be liked right now. */
  liked: boolean | null;
  mode: 'loop' | 'shuffle' | 'one' | 'order';
  lyric: string;
  progress: number;
  lyricColor: string;
  volume: number;
  cover: string;
  nickname: string;
  showTray: boolean;
  trayLyrics: boolean;
  menuBarText: 'white' | 'black' | 'auto';
}

interface CocoAppSettings {
  openAtLogin: boolean;
  closeBehavior: 'quit' | 'minimize';
  globalShortcuts: boolean;
  /** Create the main window see-through at the next launch (设置 › 外观 › 透明). */
  transparentWindow: boolean;
}

interface CocoAppSettingsResult {
  settings: CocoAppSettings;
  info: { version: string; electron: string; chrome: string; node: string; platform: string; arch: string; dataDir: string; packaged: boolean; loginItemSupported: boolean; transparentWindow: boolean };
  shortcuts: Array<{ accelerator: string; action: string; label: string; conflict: boolean }>;
}

interface Window {
  coco?: CocoDesktopBridge;
}
