import type { ILyricsTag } from 'music-metadata';
import { buildLyrics } from '../music/lrc';
import type { Lyrics } from '../music/types';

/** Tags can contain plain/LRC text or structured SYLT entries with separate timestamps. */
export function embeddedLyrics(tags: readonly (string | ILyricsTag)[] = []): Lyrics {
  let fallback: Lyrics = { lines: [], synced: false };
  for (const tag of tags) {
    if (typeof tag !== 'string' && tag.timeStampFormat === 2) {
      // ID3 format 2 is milliseconds; format 1 is MPEG frames, not milliseconds.
      const lines = (tag.syncText ?? [])
        .filter(line => typeof line.timestamp === 'number' && Number.isFinite(line.timestamp) && line.timestamp >= 0 && line.text.trim())
        .map(line => ({ time: line.timestamp! / 1000, text: line.text.trim() }))
        .sort((a, b) => a.time - b.time);
      if (lines.length) return { lines, synced: true };
    }
    const text = typeof tag === 'string' ? tag : tag.text || tag.syncText?.map(line => line.text).join('\n') || '';
    const lyrics = buildLyrics(text);
    if (lyrics.synced) return lyrics;
    // Select one version rather than concatenating duplicate languages/tags.
    if (!fallback.lines.length && lyrics.lines.length) fallback = lyrics;
  }
  return fallback;
}
