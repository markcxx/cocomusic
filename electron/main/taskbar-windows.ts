import path from 'node:path';
import { app, nativeImage, net, type BrowserWindow } from 'electron';
import { appIcon } from './branding';
import { thumbnailArtwork } from './taskbar-thumbnail';

const THUMBNAIL = 0x0323; // WM_DWMSENDICONICTHUMBNAIL

/** Custom DWM bitmaps work even when the main window is minimized or on another page. */
export function setupTaskbarArtwork(window: BrowserWindow, origin: string) {
  if (process.platform !== 'win32') return undefined;
  try {
    // Kept outside app.asar; no native code is loaded on macOS/Linux.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffi: typeof import('koffi') = require(app.isPackaged ? path.join(process.resourcesPath, 'native', 'koffi') : 'koffi');
    const dwm = ffi.load('dwmapi.dll');
    const gdi = ffi.load('gdi32.dll');
    const attribute = dwm.func('int32_t __stdcall DwmSetWindowAttribute(void *hwnd, uint32_t attribute, const void *value, uint32_t size)');
    const invalidate = dwm.func('int32_t __stdcall DwmInvalidateIconicBitmaps(void *hwnd)');
    const thumbnail = dwm.func('int32_t __stdcall DwmSetIconicThumbnail(void *hwnd, void *bitmap, uint32_t flags)');
    const create = gdi.func('void * __stdcall CreateDIBSection(void *dc, const void *info, uint32_t usage, _Out_ void **bits, void *section, uint32_t offset)');
    const copy = ffi.load('kernel32.dll').func('void __stdcall RtlMoveMemory(void *dest, const void *source, size_t length)');
    const remove = gdi.func('int __stdcall DeleteObject(void *object)');
    const hwnd = ffi.decode(window.getNativeWindowHandle(), 'void *');
    const enabled = Buffer.from([1, 0, 0, 0]);
    const fallback = appIcon() ?? nativeImage.createEmpty();
    const artwork = thumbnailArtwork({
      isDestroyed: () => window.isDestroyed(),
      invalidate: () => { if (!window.isDestroyed()) invalidate(hwnd); },
      paint: (image, size) => {
        if (image.isEmpty()) return;
        const bitmap = image.resize({ width: size, height: size, quality: 'best' }).toBitmap();
        // DWM requires a 32-bit DIB; Electron supplies top-down premultiplied BGRA.
        const info = Buffer.alloc(40);
        info.writeUInt32LE(40, 0);
        info.writeInt32LE(size, 4);
        info.writeInt32LE(-size, 8);
        info.writeUInt16LE(1, 12);
        info.writeUInt16LE(32, 14);
        const bits = [null];
        const handle = create(null, info, 0, bits, null, 0);
        if (!handle) return;
        try {
          if (bitmap.length !== size * size * 4 || !bits[0]) throw new Error('Invalid artwork bitmap');
          copy(bits[0], bitmap, bitmap.length);
          const result = thumbnail(hwnd, handle, 0);
          if (result < 0) throw new Error(`DwmSetIconicThumbnail failed: ${result}`);
        } finally { remove(handle); }
      },
    }, fallback, async (cover, signal) => {
      const url = cover.startsWith('/') ? new URL(cover, origin).href : cover;
      const response = await net.fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
      if (!response.ok || !response.body) throw new Error('Artwork unavailable');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > 10 * 1024 * 1024) throw new Error('Artwork too large');
          chunks.push(value);
        }
      } finally { await reader.cancel(); }
      return nativeImage.createFromBuffer(Buffer.concat(chunks));
    });
    window.hookWindowMessage(THUMBNAIL, (_wParam, lParam) => {
      try { artwork.paint(lParam); } catch (error) { console.warn('[taskbar] Thumbnail failed', error); }
    });
    if (attribute(hwnd, 7, enabled, 4) < 0 || attribute(hwnd, 10, enabled, 4) < 0) {
      window.unhookWindowMessage(THUMBNAIL);
      attribute(hwnd, 7, Buffer.alloc(4), 4);
      return undefined;
    }
    invalidate(hwnd);
    window.once('closed', () => artwork.dispose());
    return artwork;
  } catch (error) {
    // Unsupported DWM/native module: retain Electron's regular window preview and buttons.
    console.warn('[taskbar] Custom artwork unavailable', error);
    return undefined;
  }
}
