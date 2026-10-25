import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

export type DownloadProgress = { received: number; total: number; speed: number };

export async function fileSha256(file: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** Download into a staging file, committing only after SHA-256 and size verification. */
export async function downloadInstaller(options: {
  directory: string;
  asset: { name: string; url: string; size: number };
  expected: string;
  signal: AbortSignal;
  fetch: (url: string, options: { signal: AbortSignal }) => Promise<Response>;
  onProgress: (progress: DownloadProgress) => void;
}) {
  const { asset, expected, directory, signal, onProgress } = options;
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error('安装包校验值无效');
  if (path.basename(asset.name) !== asset.name || /[\\/]/.test(asset.name)) throw new Error('安装包文件名无效');
  signal.throwIfAborted();
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, asset.name);
  const partial = `${file}.part`;
  try {
    const existing = await stat(file).catch(() => null);
    if (existing && (!asset.size || existing.size === asset.size) && await fileSha256(file) === expected) {
      signal.throwIfAborted();
      onProgress({ received: existing.size, total: existing.size, speed: 0 });
      return { file, bytes: existing.size };
    }
    const response = await options.fetch(asset.url, { signal });
    if (!response.ok || !response.body) throw new Error(`安装包下载失败（${response.status}）`);
    const total = Number(response.headers.get('content-length')) || asset.size;
    const hash = createHash('sha256');
    let received = 0;
    let sent = 0;
    let sample = { at: Date.now(), bytes: 0 };
    let speed = 0;
    const body = Readable.fromWeb(response.body as WebReadableStream<Uint8Array>);
    body.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      received += chunk.length;
      const now = Date.now();
      if (now - sample.at >= 500) { speed = ((received - sample.bytes) * 1000) / (now - sample.at); sample = { at: now, bytes: received }; }
      if (now - sent >= 200) { sent = now; onProgress({ received, total, speed }); }
    });
    await pipeline(body, createWriteStream(partial, { mode: 0o600 }), { signal });
    signal.throwIfAborted();
    if (hash.digest('hex') !== expected || (asset.size > 0 && received !== asset.size)) throw new Error('安装包校验失败，文件可能已损坏，请重新下载');
    await rename(partial, file);
    onProgress({ received, total: received, speed: 0 });
    return { file, bytes: received };
  } catch (error) {
    await rm(partial, { force: true }).catch(() => undefined);
    throw error;
  }
}
