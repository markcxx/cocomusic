import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLyrics } from '../music/lrc.ts';
import { isAudioFile, safeFileName } from './formats.ts';
import { clipLyrics, toLrc } from './lrc-writer.ts';

test('safeFileName strips characters Windows/macOS reject and reserved names', () => {
  assert.equal(safeFileName('AC/DC - Back: In "Black"?'), 'AC_DC - Back_ In _Black__');
  assert.equal(safeFileName('  trailing dots... '), 'trailing dots');
  assert.equal(safeFileName('CON'), '_CON');
  assert.equal(safeFileName('\u0000\u0007'), '未命名');
  assert.equal([...safeFileName('长'.repeat(300))].length, 120);
});

test('isAudioFile matches registered extensions case-insensitively', () => {
  assert.ok(isAudioFile('/a/b/Song.FLAC'));
  assert.ok(isAudioFile('x.m4a'));
  assert.ok(!isAudioFile('cover.jpg'));
  assert.ok(!isAudioFile('noext'));
});

test('toLrc round-trips through the parser, including translations', () => {
  const lyrics = buildLyrics('[00:01.50]Hello\n[01:02.25]World', '[00:01.50]你好\n[01:02.25]世界');
  const text = toLrc(lyrics, { title: 'T', artist: 'A' });
  assert.match(text, /^\[ti:T\]\n\[ar:A\]\n\[00:01\.50\]Hello\n\[01:02\.25\]World\n\[by:coco-translation\]\n/);
  const [original, translated] = text.split(/\n\[by:coco-translation\]\n/);
  const back = buildLyrics(original, translated);
  assert.deepEqual(back.lines, lyrics.lines);
});

test('clipLyrics moves a preview clip onto its own timeline', () => {
  const lyrics = buildLyrics('[00:10.00]a\n[00:50.00]b\n[01:05.00]c\n[01:40.00]d');
  // Clip covers 60s–90s: "b" is mid-line at the start, "c" falls inside, "d" is past the end.
  assert.deepEqual(clipLyrics(lyrics, 60, 90).lines, [{ time: 0, text: 'b' }, { time: 5, text: 'c' }]);
  // A clip from the very start keeps original times.
  assert.deepEqual(clipLyrics(lyrics, 0, 55).lines.map(line => line.time), [10, 50]);
  // Unsynced lyrics pass through unchanged.
  const plain = buildLyrics('第一行');
  assert.equal(clipLyrics(plain, 30, 60), plain);
});

test('toLrc writes unsynced lyrics as plain lines and nothing for empty lyrics', () => {
  assert.equal(toLrc({ lines: [], synced: false }), '');
  assert.equal(toLrc({ lines: [{ time: 0, text: '第一行' }], synced: false }), '第一行\n');
});
