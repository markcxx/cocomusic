import type { Lyrics } from '../music/types';

// Pure helpers (no Node imports) so tests can load them directly.

/**
 * Lyrics for a preview clip covering [start, end) of the song: times shift to
 * the clip's own timeline, lines outside it are dropped, and the line already
 * being sung when the clip starts is kept at 0.
 */
export function clipLyrics(lyrics: Lyrics, start: number, end: number): Lyrics {
  if (!lyrics.synced || !lyrics.lines.length) return lyrics;
  const lines = lyrics.lines;
  const firstInside = lines.findIndex(line => line.time >= start);
  const carried = firstInside > 0 ? lines[firstInside - 1] : firstInside < 0 ? lines[lines.length - 1] : undefined;
  const inside = lines.filter(line => line.time >= start && line.time < end).map(line => ({ ...line, time: line.time - start }));
  const head = carried && carried.time < start && (!inside.length || inside[0].time > 0) ? [{ ...carried, time: 0 }] : [];
  return { ...lyrics, lines: [...head, ...inside] };
}

const stamp = (seconds: number) => {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const rest = total - minutes * 60;
  return `[${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}]`;
};

/**
 * Lyrics → `.lrc` text written next to a downloaded song. Translations follow a
 * marker line (read back by the local library), so standard players still show
 * the original lyrics while CoCo restores both.
 */
export function toLrc(lyrics: Lyrics, meta: { title?: string; artist?: string; album?: string } = {}) {
  if (!lyrics.lines.length) return '';
  const head = [meta.title && `[ti:${meta.title}]`, meta.artist && `[ar:${meta.artist}]`, meta.album && `[al:${meta.album}]`].filter(Boolean);
  if (!lyrics.synced) return [...head, ...lyrics.lines.map(line => line.text)].join('\n') + '\n';
  const original = lyrics.lines.map(line => `${stamp(line.time)}${line.text}`);
  const translated = lyrics.lines.filter(line => line.translation).map(line => `${stamp(line.time)}${line.translation}`);
  return [...head, ...original, ...(translated.length ? ['[by:coco-translation]', ...translated] : [])].join('\n') + '\n';
}
