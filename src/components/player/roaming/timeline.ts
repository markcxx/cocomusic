import type { LyricLine } from '@/server/music/types';

/**
 * The song as a sequence of "stations" for the camera, each with its lyric
 * split into karaoke units. Pure data, derived once per song: everything the
 * scene shows at a moment is a function of (timeline, song time), so seeking,
 * pausing and replaying always reproduce the same picture.
 */

/** One karaoke unit: a CJK character or a Latin word, with its sung span. */
export type Unit = {
  text: string;
  /** Character offset in the line (keeps kerned positions when laid out). */
  offset: number;
  start: number;
  end: number;
};

export type Station = {
  index: number;
  text: string;
  translation?: string;
  start: number;
  /** When the last unit finishes (≤ the next station's start). */
  end: number;
  /** Start of the next station (or song end). */
  next: number;
  units: Unit[];
  /** Interlude placeholder ("……", "♪"): never framed by the camera. */
  filler: boolean;
  /** Part of a repeated block (chorus guess). */
  chorus: boolean;
  /** First line after a long gap (a new section). */
  sectionStart: boolean;
  /** Has a unit held ≥ 1.2 s (a long note). */
  held: boolean;
  /** Mean unit length < 0.18 s (quick, staccato delivery). */
  staccato: boolean;
};

const CJK = /[぀-ヿ㐀-鿿豈-﫿가-힯ｦ-ﾟ]/;
const FILLER = /^[\s.。…·•♪♫~～\-—_*]*$/;

/** Split text into karaoke units: each CJK character alone, Latin runs as words, spaces skipped. */
export function splitUnits(text: string): Array<{ text: string; offset: number }> {
  const units: Array<{ text: string; offset: number }> = [];
  const chars = Array.from(text);
  let offset = 0;
  let word = '';
  let wordAt = 0;
  const flush = () => { if (word) units.push({ text: word, offset: wordAt }); word = ''; };
  for (const char of chars) {
    if (/\s/.test(char)) { flush(); }
    else if (CJK.test(char)) { flush(); units.push({ text: char, offset }); }
    else { if (!word) wordAt = offset; word += char; }
    offset += char.length;
  }
  flush();
  return units;
}

/** Spread a span evenly across the units' character counts. */
function spread(units: Array<{ text: string; offset: number }>, start: number, end: number): Unit[] {
  const total = units.reduce((sum, unit) => sum + Array.from(unit.text).length, 0) || 1;
  let cursor = start;
  return units.map(unit => {
    const share = ((end - start) * Array.from(unit.text).length) / total;
    const out = { ...unit, start: cursor, end: cursor + share };
    cursor += share;
    return out;
  });
}

/**
 * Units timed by the platform's word timing when present (each word's span
 * spread over its own characters), else evenly over the line.
 */
function timeUnits(line: LyricLine, end: number): Unit[] {
  const units = splitUnits(line.text);
  if (!line.words?.length) return spread(units, line.time, end);
  // Map every character of the line to the word timing that covers it.
  const charTimes: Array<{ start: number; end: number }> = [];
  for (const word of line.words) {
    // Whitespace inside a word's text carries no singing time.
    const chars = Array.from(word.text).filter(char => !/\s/.test(char));
    if (!chars.length) continue;
    const span = Math.max(0.01, word.end - word.start);
    chars.forEach((_, i) => charTimes.push({ start: word.start + (span * i) / chars.length, end: word.start + (span * (i + 1)) / chars.length }));
  }
  // Word texts may differ slightly from the line text (spaces); align by index, clamp at the end.
  const lineChars = Array.from(line.text);
  const timed: Array<{ start: number; end: number } | null> = [];
  let k = 0;
  for (const char of lineChars) {
    if (/\s/.test(char)) { timed.push(null); continue; }
    timed.push(charTimes[Math.min(k, charTimes.length - 1)] ?? null);
    k += 1;
  }
  let charIndex = 0;
  const offsets = lineChars.map(char => { const at = charIndex; charIndex += char.length; return at; });
  return units.map(unit => {
    const first = offsets.indexOf(unit.offset);
    const count = Array.from(unit.text).length;
    const span = timed.slice(first, first + count).filter(Boolean) as Array<{ start: number; end: number }>;
    if (!span.length) return { ...unit, start: line.time, end };
    return { ...unit, start: span[0].start, end: span[span.length - 1].end };
  });
}

/** Lines that repeat (same text, ≥ 2 times) are a cheap but reliable chorus signal. */
function chorusSet(lines: LyricLine[]) {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const key = line.text.replace(/\s+/g, '').toLowerCase();
    if (key.length >= 4) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n >= 2).map(([key]) => key));
}

export function buildTimeline(lines: LyricLine[], duration: number): Station[] {
  const real = lines.filter(line => line.text.trim());
  const chorus = chorusSet(real);
  return real.map((line, index) => {
    const following = real[index + 1]?.time;
    const next = following ?? Math.max(line.time + 4, duration || line.time + 6);
    // A line is sung for at most 8 s even before a long instrumental gap.
    const end = Math.max(line.time + 0.1, Math.min(next, line.time + 8));
    const units = timeUnits(line, end);
    const spans = units.map(unit => unit.end - unit.start);
    const mean = spans.reduce((a, b) => a + b, 0) / Math.max(1, spans.length);
    const gapBefore = index === 0 ? Infinity : line.time - (real[index - 1].time + 8 > line.time ? real[index - 1].time : real[index - 1].time + 8);
    return {
      index,
      text: line.text,
      translation: line.translation,
      start: line.time,
      end: units.length ? Math.max(...units.map(unit => unit.end)) : end,
      next,
      units,
      filler: FILLER.test(line.text),
      chorus: chorus.has(line.text.replace(/\s+/g, '').toLowerCase()),
      sectionStart: index === 0 || gapBefore > 6,
      held: spans.some(span => span >= 1.2),
      staccato: units.length > 3 && mean < 0.18,
    };
  });
}

/** Index of the station being sung at `time` (−1 before the first). */
export function stationAt(stations: Station[], time: number) {
  let low = 0;
  let high = stations.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (stations[mid].start <= time) low = mid + 1; else high = mid;
  }
  return low - 1;
}

/** The station the camera should frame: the current one, skipping filler back to the last real line. */
export function framedStation(stations: Station[], time: number) {
  let index = stationAt(stations, time);
  while (index > 0 && stations[index].filler) index -= 1;
  return Math.max(0, index);
}

/** 0…1 sung progress of a unit at `time`. */
export const unitProgress = (unit: Unit, time: number) => (time <= unit.start ? 0 : time >= unit.end ? 1 : (time - unit.start) / Math.max(0.001, unit.end - unit.start));

/**
 * Where along the line the singing is (0…1, by character position), used to
 * truck the camera with the sung word.
 */
export function readPosition(station: Station, time: number) {
  const units = station.units;
  if (!units.length) return 0.5;
  const length = Math.max(1, station.text.length);
  for (const unit of units) {
    if (time < unit.end) {
      const p = unitProgress(unit, time);
      return Math.min(1, (unit.offset + unit.text.length * p) / length);
    }
  }
  return 1;
}
