import type { LyricLine, LyricWord, Lyrics } from './types';

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

/* ───────── Word-by-word lyrics ───────── */

/**
 * Kugou KRC (decoded) or NetEase YRC: `[lineStartMs,lineDurMs]` then per word
 * `<offsetMs,durMs,0>text` (KRC, offset relative to the line) or
 * `(startMs,durMs,0)text` (YRC, absolute). Returns timed lines with words.
 */
export function parseWordLyrics(source: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const head = /^\[(\d+),(\d+)\](.*)$/.exec(raw.trim());
    if (!head) continue;
    const lineStart = Number(head[1]);
    const body = head[3];
    const words: LyricWord[] = [];
    const pattern = /[<(](\d+),(\d+),-?\d+[>)]([^<(]*)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(body))) {
      const relative = body[match.index] === '<';
      const startMs = relative ? lineStart + Number(match[1]) : Number(match[1]);
      words.push({ start: startMs / 1000, end: (startMs + Number(match[2])) / 1000, text: match[3] });
    }
    const text = words.map(word => word.text).join('').trim();
    if (!text) continue;
    lines.push({ time: lineStart / 1000, text, words: words.filter(word => word.text) });
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** Attach word timing to LRC lines that start at (about) the same time. */
export function attachWords(lines: LyricLine[], timed: readonly LyricLine[]): LyricLine[] {
  if (!timed.length) return lines;
  let cursor = 0;
  return lines.map(line => {
    while (cursor < timed.length && timed[cursor].time < line.time - 0.6) cursor += 1;
    const match = timed[cursor];
    if (match && Math.abs(match.time - line.time) <= 0.6 && match.words?.length) {
      cursor += 1;
      return { ...line, words: match.words };
    }
    return line;
  });
}

/**
 * Without word timing, the fill finishes this share of the gap before the next
 * line (at least 0.35 s, at most 1.6 s), so a line completes and rests a beat
 * before switching instead of ending at the very instant the next one starts.
 */
const REST_SHARE = 0.18;

/**
 * How much of a line has been sung (0–1, by characters). Uses word timing when
 * present, otherwise spreads the line evenly over the gap to the next line,
 * minus a short rest at the end.
 */
export function lineProgress(line: LyricLine | undefined, next: LyricLine | undefined, seconds: number) {
  if (!line) return 0;
  const words = line.words;
  if (words?.length) {
    const total = words.reduce((sum, word) => sum + word.text.length, 0) || 1;
    let sung = 0;
    for (const word of words) {
      if (seconds >= word.end) { sung += word.text.length; continue; }
      if (seconds > word.start) sung += word.text.length * ((seconds - word.start) / Math.max(0.01, word.end - word.start));
      break;
    }
    return Math.min(1, Math.max(0, sung / total));
  }
  if (!next) return 1;
  const gap = Math.max(0.6, next.time - line.time);
  const rest = Math.min(1.6, Math.max(0.35, gap * REST_SHARE), gap * 0.4);
  return Math.min(1, Math.max(0, (seconds - line.time) / (gap - rest)));
}

/** End time of a line's vocal delivery (seconds), estimated when word timing is absent. */
export function lineEndTime(line: LyricLine, next?: LyricLine): number {
  if (line.words?.length) return line.words[line.words.length - 1].end;
  const span = next ? Math.min(4.2, Math.max(1.2, (next.time - line.time) * 0.48)) : 3.5;
  return line.time + span;
}

/**
 * Active instrumental interlude (intro before line 0, or a ≥5.5s bridge between
 * lines). Returns `afterIndex` (-1 for intro) and `progress` (0 → 1 until the next vocal).
 */
export function interludeAt(lines: readonly LyricLine[], active: number, seconds: number): { afterIndex: number; progress: number } | null {
  if (!lines.length) return null;
  if (active < 0) {
    const first = lines[0].time;
    if (first >= 4.5 && seconds >= 0.25 && seconds < first - 0.15) {
      return { afterIndex: -1, progress: Math.min(1, Math.max(0, (seconds - 0.25) / Math.max(0.5, first - 0.4))) };
    }
    return null;
  }
  const current = lines[active];
  const next = lines[active + 1];
  if (!current || !next) return null;
  const vocalEnd = lineEndTime(current, next);
  if (next.time - vocalEnd < 5.5) return null;
  const start = vocalEnd + 0.35;
  const end = next.time - 0.15;
  if (seconds < start || seconds >= end) return null;
  return { afterIndex: active, progress: Math.min(1, Math.max(0, (seconds - start) / Math.max(0.5, end - start))) };
}

const CREDIT_PATTERN = /^(作词|作曲|编曲|制作|混音|母带|录音|和声|吉他|贝斯|鼓|弦乐|监制|出品|词|曲|编)\s*[:：]/i;
const normalizeHook = (text: string) => text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

/**
 * Fallback chorus detector from synced lyrics: finds the strongest repeated
 * multi-line hook (2+ lines) when the upstream platform provides no chorus window.
 */
export function detectLyricChorus(lines: readonly LyricLine[], totalDuration = 0): { start: number; end: number } | undefined {
  if (lines.length < 8) return undefined;
  const norms = lines.map(line => (CREDIT_PATTERN.test(line.text.trim()) ? '' : normalizeHook(line.text)));
  let best: { score: number; start: number; end: number } | undefined;

  for (let i = 0; i < lines.length - 3; i += 1) {
    if (norms[i].length < 3) continue;
    let repeats = 0;
    let bestLen = 0;
    for (let j = i + 2; j < lines.length - 1; j += 1) {
      if (norms[j] !== norms[i]) continue;
      let len = 1;
      while (i + len < j && j + len < lines.length && norms[i + len].length >= 2 && norms[i + len] === norms[j + len]) {
        len += 1;
      }
      if (len >= 2) {
        repeats += 1;
        if (len > bestLen) bestLen = len;
      }
    }
    if (!repeats || bestLen < 2) continue;
    const start = lines[i].time;
    const rawEnd = lines[i + bestLen]?.time ?? lineEndTime(lines[i + bestLen - 1]);
    const end = Math.min(totalDuration > 0 ? totalDuration : rawEnd, Math.max(start + 14, Math.min(start + 36, rawEnd)));
    if (end - start < 10) continue;
    const chars = norms.slice(i, i + bestLen).reduce((sum, s) => sum + s.length, 0);
    // Prefer hooks after the intro (~12s+) with multiple lines and repeats.
    const timingBonus = start >= 18 ? 6 : start >= 8 ? 2 : 0;
    const score = repeats * 12 + bestLen * 5 + chars * 0.25 + timingBonus;
    if (!best || score > best.score) best = { score, start: Math.round(start), end: Math.round(end) };
  }
  return best ? { start: best.start, end: best.end } : undefined;
}
