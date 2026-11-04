import type { NativeImage } from 'electron';

/** DWM supplies its maximum dimensions, packed as width:height in lParam. */
export function thumbnailSize(parameter: Buffer) {
  const packed = parameter.readUInt32LE(0);
  return Math.max(1, Math.min(packed >>> 16, packed & 0xffff, 512));
}

export interface ThumbnailHost {
  isDestroyed(): boolean;
  invalidate(): void;
  paint(image: NativeImage, size: number): void;
}

/** Keep only the current cover; slow responses from an older song must never win. */
export function thumbnailArtwork(host: ThumbnailHost, fallback: NativeImage, load: (url: string, signal: AbortSignal) => Promise<NativeImage>) {
  let key = '';
  let revision = 0;
  let controller: AbortController | undefined;
  let image = fallback;
  return {
    update(url: string) {
      if (url === key) return;
      key = url;
      const current = ++revision;
      controller?.abort();
      controller = new AbortController();
      image = fallback;
      host.invalidate();
      if (!url) return;
      void load(url, controller.signal).then(next => {
        if (current !== revision || host.isDestroyed() || next.isEmpty()) return;
        image = next;
        host.invalidate();
      }).catch(() => { /* The default artwork remains visible on errors. */ });
    },
    paint(parameter: Buffer) { if (!host.isDestroyed()) host.paint(image, thumbnailSize(parameter)); },
    dispose() { revision++; controller?.abort(); },
  };
}
