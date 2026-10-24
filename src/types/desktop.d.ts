/**
 * Renderer-side view of the preload bridge (electron/preload/index.ts).
 * Optional on Window: absent when the UI is opened in a plain browser (`npm run dev:web`).
 */
interface CocoDesktopBridge {
  platform: NodeJS.Platform;
  /** OS backdrop material behind the transparent window. */
  material: 'acrylic' | 'vibrancy' | 'none';
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
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
    setMaterial(effect: 'acrylic' | 'mica' | 'vibrancy' | 'none'): void;
    /** Light/dark for native chrome and the OS material tint. */
    setColorScheme(mode: 'system' | 'light' | 'dark'): void;
    openDataFolder(): void;
    /** Global media shortcut fired (only while enabled in settings). */
    onShortcut(listener: (action: 'toggle' | 'next' | 'previous' | 'volume-up' | 'volume-down' | 'lyrics' | string) => void): () => void;
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

interface CocoAppSettings {
  openAtLogin: boolean;
  closeBehavior: 'quit' | 'minimize';
  globalShortcuts: boolean;
}

interface CocoAppSettingsResult {
  settings: CocoAppSettings;
  info: { version: string; electron: string; chrome: string; node: string; platform: string; arch: string; dataDir: string; packaged: boolean; loginItemSupported: boolean };
  shortcuts: Array<{ accelerator: string; action: string; label: string; conflict: boolean }>;
}

interface Window {
  coco?: CocoDesktopBridge;
}
