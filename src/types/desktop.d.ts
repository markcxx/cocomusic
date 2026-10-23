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
    /** Shrink to a compact always-on-top window, or restore. */
    toggleMini(): void;
  };
}

interface Window {
  coco?: CocoDesktopBridge;
}
