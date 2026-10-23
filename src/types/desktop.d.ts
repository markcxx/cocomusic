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
}

interface Window {
  coco?: CocoDesktopBridge;
}
