import { copyFile, rename, rm } from 'node:fs/promises';
import { ByteVector, File, Picture, PictureType, ReadStyle } from 'node-taglib-sharp';

const MAX_COVER_BYTES = 10 * 1024 * 1024;

async function coverBytes(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15_000)]) });
  if (!response.ok || !response.body) throw new Error('封面下载失败');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_COVER_BYTES) throw new Error('封面文件过大');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks);
  // Only embed actual JPEG/PNG images, never an HTML error page or arbitrary payload.
  const mime = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'image/jpeg'
    : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png' : null;
  if (!mime) throw new Error('封面格式不支持');
  return { bytes, mime };
}

/** Tag a separate staging copy so a failed writer cannot damage the downloaded audio. */
export async function embedMetadata(file: string, extension: string, track: { title: string; artist: string; album?: string; cover?: string }, signal?: AbortSignal): Promise<string | undefined> {
  let warning: string | undefined;
  let cover: Awaited<ReturnType<typeof coverBytes>> | undefined;
  if (track.cover) {
    try { cover = await coverBytes(track.cover, signal); }
    catch { warning = '封面未能写入，歌曲已保留'; }
  }
  signal?.throwIfAborted();
  const staged = `${file}.metadata.${extension}`;
  try {
    await copyFile(file, staged);
    const audio = File.createFromPath(staged, `taglib/${extension}`, ReadStyle.None);
    try {
      audio.tag.title = track.title;
      audio.tag.performers = [track.artist];
      if (track.album) audio.tag.album = track.album;
      if (cover) audio.tag.pictures = [Picture.fromFullData(ByteVector.fromByteArray(cover.bytes), PictureType.FrontCover, cover.mime, 'Cover')];
      audio.save();
    } finally { audio.dispose(); }
    signal?.throwIfAborted();
    await rename(staged, file);
    return warning;
  } catch (error) {
    if (signal?.aborted) throw error;
    return '该文件未能写入歌曲标签或封面，原始音频已保留';
  } finally { await rm(staged, { force: true }); }
}
