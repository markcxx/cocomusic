import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeLineIndex, attachWords, buildLyrics, lineProgress, parseLrc, parseWordLyrics } from './lrc.ts';

test('parses stamps with 2- and 3-digit fractions and repeated stamps', () => {
  const { timed } = parseLrc('[00:12.57]难以忘记\n[01:02.5][00:03.050]副歌\n[ar:歌手]');
  assert.deepEqual(timed.map(line => [Number(line.time.toFixed(3)), line.text]), [[3.05, '副歌'], [12.57, '难以忘记'], [62.5, '副歌']]);
});

test('reads NetEase JSON credit lines', () => {
  const { timed } = parseLrc('{"t":1000,"c":[{"tx":"作曲: "},{"tx":"汤小康"}]}\n[00:04.050]');
  assert.deepEqual(timed[0], { time: 1, text: '作曲: 汤小康' });
});

test('drops empty lines and pairs translations by timestamp', () => {
  const lyrics = buildLyrics('[00:01.00]Hello\n[00:02.00]\n[00:03.00]World', '[00:01.00]你好\n[00:03.01]世界');
  assert.equal(lyrics.synced, true);
  assert.deepEqual(lyrics.lines, [
    { time: 1, text: 'Hello', translation: '你好' },
    { time: 3, text: 'World', translation: '世界' },
  ]);
});

test('falls back to unsynced text', () => {
  const lyrics = buildLyrics('第一行\n第二行');
  assert.equal(lyrics.synced, false);
  assert.deepEqual(lyrics.lines.map(line => line.text), ['第一行', '第二行']);
});

test('finds the active line', () => {
  const lines = [{ time: 1, text: 'a' }, { time: 5, text: 'b' }, { time: 9, text: 'c' }];
  assert.equal(activeLineIndex(lines, 0.5), -1);
  assert.equal(activeLineIndex(lines, 1), 0);
  assert.equal(activeLineIndex(lines, 8.99), 1);
  assert.equal(activeLineIndex(lines, 100), 2);
  assert.equal(activeLineIndex([], 3), -1);
});

test('parses Kugou KRC (relative) and NetEase YRC (absolute) word timing', () => {
  const krc = parseWordLyrics('[ti:x]\n[2250,2250]<0,450,0>词<450,450,0>：<900,450,0>周');
  assert.equal(krc[0].text, '词：周');
  assert.deepEqual(krc[0].words?.[1], { start: 2.7, end: 3.15, text: '：' });
  const yrc = parseWordLyrics('[1000,800](1000,300,0)Hel(1300,500,0)lo');
  assert.equal(yrc[0].text, 'Hello');
  assert.equal(yrc[0].words?.[1].start, 1.3);
});

test('line progress follows words, or spreads evenly without them', () => {
  const [line] = parseWordLyrics('[0,2000]<0,1000,0>ab<1000,1000,0>cd');
  assert.equal(lineProgress(line, undefined, 0), 0);
  assert.equal(lineProgress(line, undefined, 1), 0.5);
  assert.equal(lineProgress(line, undefined, 1.5), 0.75);
  assert.equal(lineProgress({ time: 0, text: 'x' }, { time: 4, text: 'y' }, 2), 0.5);
  const merged = attachWords([{ time: 0.05, text: 'abcd' }], [line]);
  assert.equal(merged[0].words?.length, 2);
});
