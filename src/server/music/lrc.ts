import type { LyricLine, Lyrics } from './types';

// Platform-neutral LRC parsing. Kept free of runtime imports so tests can load it directly.

const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

type Timed = { time: number; text: string };

/** One `{"t":ms,"c":[{"tx":"…"}]}` credit line (NetEase lyric v1 prepends these). */
function jsonLine(line: string): Timed | null {
  if (!line.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(line) as { t?: unknown; c?: unknown };
    if (typeof parsed.t !== 'number' || !Array.isArray(parsed.c)) return null;
    const text = parsed.c.map(part => (part && typeof part === 'object' && typeof (part as { tx?: unknown }).tx === 'string' ? (part as { tx: string }).tx : '')).join('');
    return { time: parsed.t / 1000, text: text.trim() };
  } catch {
    return null;
  }
}

/** All timed lines of an LRC document, sorted by time; untimed text goes to `plain`. */
export function parseLrc(source: string): { timed: Timed[]; plain: string[] } {
  const timed: Timed[] = [];
  const plain: string[] = [];
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const json = jsonLine(line);
    if (json) { timed.push(json); continue; }
    const stamps: number[] = [];
    let rest = line;
    // Leading stamps only: `[00:12.00][01:30.00]text` repeats a line at several times.
    for (;;) {
      STAMP.lastIndex = 0;
      const match = STAMP.exec(rest);
      if (!match || match.index !== 0) break;
      const fraction = match[3] ? Number(match[3]) / 10 ** match[3].length : 0;
      stamps.push(Number(match[1]) * 60 + Number(match[2]) + fraction);
      rest = rest.slice(match[0].length);
    }
    if (stamps.length) {
      for (const time of stamps) timed.push({ time, text: rest.trim() });
    } else if (!/^\[[a-z]+:.*\]$/i.test(line)) {
      // Skip ID tags like [ar:…]/[ti:…]; keep anything else as unsynced text.
      plain.push(line);
    }
  }
  timed.sort((a, b) => a.time - b.time);
  return { timed, plain };
}

/** Merge original and translated LRC into display lines. Translations pair by timestamp. */
export function buildLyrics(original: string, translated = ''): Lyrics {
  const { timed, plain } = parseLrc(original);
  const lines = timed.filter(line => line.text);
  if (!lines.length) {
    return { lines: plain.map(text => ({ time: 0, text })), synced: false };
  }
  const translations = parseLrc(translated).timed.filter(line => line.text && line.text !== '//');
  const result: LyricLine[] = lines.map(line => ({ time: line.time, text: line.text }));
  let cursor = 0;
  for (const line of result) {
    // Both lists are sorted; advance to the closest translation within 50ms.
    while (cursor < translations.length && translations[cursor].time < line.time - 0.05) cursor += 1;
    const match = translations[cursor];
    if (match && Math.abs(match.time - line.time) <= 0.05) {
      line.translation = match.text;
      cursor += 1;
    }
  }
  return { lines: result, synced: true };
}

/** Index of the line being sung at `seconds` (-1 before the first line). Binary search. */
export function activeLineIndex(lines: readonly LyricLine[], seconds: number) {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lines[middle].time <= seconds) { found = middle; low = middle + 1; } else { high = middle - 1; }
  }
  return found;
}
