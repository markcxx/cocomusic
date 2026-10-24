import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { AUDIO_TYPES, extensionOf } from './formats';

/**
 * Serve a file with HTTP Range support so <audio> can seek and the browser can
 * fetch only what it needs. `file` must come from the library index, never from
 * the request.
 */
export function streamFile(file: string, range: string | null): Response {
  let size: number;
  try { size = statSync(file).size; } catch { return new Response('Not found', { status: 404 }); }
  const type = AUDIO_TYPES[extensionOf(file)] ?? 'application/octet-stream';
  const headers: Record<string, string> = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };

  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (match && (match[1] || match[2])) {
    // bytes=start-end | bytes=start- | bytes=-suffixLength
    let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    let end = match[1] && match[2] ? Number(match[2]) : size - 1;
    end = Math.min(end, size - 1);
    if (!Number.isFinite(start) || start > end || start >= size) {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
    }
    start = Math.max(0, start);
    const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(body, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
  }
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(body, { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
}
