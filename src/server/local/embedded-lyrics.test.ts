import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ILyricsTag } from 'music-metadata';
import { activeLineIndex } from '../music/lrc.ts';
import { embeddedLyrics } from './embedded-lyrics.ts';

const tag = (values: Partial<ILyricsTag>): ILyricsTag => ({ contentType: 1, timeStampFormat: 2, syncText: [], ...values });

test('SYLT milliseconds survive conversion and advance the active lyric', () => {
  const lyrics = embeddedLyrics([tag({ syncText: [
    { timestamp: 7540, text: 'third' },
    { timestamp: 10, text: 'first' },
    { timestamp: 3780, text: 'second' },
  ] })]);
  assert.equal(lyrics.synced, true);
  assert.deepEqual(lyrics.lines.map(line => line.time), [0.01, 3.78, 7.54]);
  assert.equal(activeLineIndex(lyrics.lines, 1), 0);
  assert.equal(activeLineIndex(lyrics.lines, 4), 1);
  assert.equal(activeLineIndex(lyrics.lines, 8), 2);
});

test('prefers synchronization over plain tags without duplicating lyrics', () => {
  const lyrics = embeddedLyrics([tag({ text: 'first\nsecond' }), tag({ text: '', syncText: [{ timestamp: 1000, text: 'first' }] })]);
  assert.deepEqual(lyrics, { synced: true, lines: [{ time: 1, text: 'first' }] });
});

test('keeps embedded LRC, plain text, legacy strings and absent lyrics working', () => {
  assert.equal(embeddedLyrics([tag({ text: '[00:01.50]first' })]).lines[0].time, 1.5);
  assert.equal(embeddedLyrics(['[00:02.00]first']).synced, true);
  assert.deepEqual(embeddedLyrics([tag({ text: 'first\nsecond' })]), {
    synced: false, lines: [{ time: 0, text: 'first' }, { time: 0, text: 'second' }],
  });
  assert.deepEqual(embeddedLyrics(), { lines: [], synced: false });
});

test('does not interpret MPEG frame numbers as milliseconds', () => {
  const lyrics = embeddedLyrics([tag({ timeStampFormat: 1, syncText: [{ timestamp: 100, text: 'first' }] })]);
  assert.deepEqual(lyrics, { synced: false, lines: [{ time: 0, text: 'first' }] });
});

test('ignores invalid times and empty entries when valid synchronization exists', () => {
  const lyrics = embeddedLyrics([tag({ syncText: [
    { text: 'missing' }, { timestamp: NaN, text: 'nan' },
    { timestamp: Infinity, text: 'infinite' }, { timestamp: -1, text: 'negative' },
    { timestamp: 0, text: '  ' }, { timestamp: 1000, text: ' valid ' },
  ] })]);
  assert.deepEqual(lyrics, { synced: true, lines: [{ time: 1, text: 'valid' }] });
});
