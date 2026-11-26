import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeLineIndex, attachWords, buildLyrics, detectLyricChorus, interludeAt, lineProgress, parseLrc, parseWordLyrics } from './lrc.ts';

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
  // Even spread finishes before the next line (4 s gap → done at 3.28 s), then rests.
  assert.ok(Math.abs(lineProgress({ time: 0, text: 'x' }, { time: 4, text: 'y' }, 1.64) - 0.5) < 1e-9);
  assert.equal(lineProgress({ time: 0, text: 'x' }, { time: 4, text: 'y' }, 3.4), 1);
  // Short lines still keep most of their time for the fill.
  assert.ok(lineProgress({ time: 0, text: 'x' }, { time: 1, text: 'y' }, 0.5) < 1);
  const merged = attachWords([{ time: 0.05, text: 'abcd' }], [line]);
  assert.equal(merged[0].words?.length, 2);
});

test('interludeAt detects long intros and instrumental bridges', () => {
  const lines = [
    { time: 8, text: '第一句主歌' },
    { time: 12, text: '第二句主歌', words: [{ start: 12, end: 14, text: '第二句主歌' }] },
    { time: 24, text: '间奏后的副歌' },
  ];
  const intro = interludeAt(lines, -1, 4);
  assert.ok(intro && intro.afterIndex === -1 && intro.progress > 0 && intro.progress < 1);
  assert.equal(interludeAt(lines, 0, 9), null);
  const bridge = interludeAt(lines, 1, 18);
  assert.ok(bridge && bridge.afterIndex === 1 && bridge.progress > 0.3 && bridge.progress < 0.5);
});

test('detectLyricChorus locates repeated multi-line chorus hooks', () => {
  const lines = [
    { time: 0, text: '作词: 某人' },
    { time: 10, text: '走过安静的街角' },
    { time: 15, text: '风吹落了树叶' },
    { time: 22, text: '我只是可惜不太够时间去拥抱你' },
    { time: 28, text: '试着去忘记些什么' },
    { time: 34, text: '这阳台也让我很刺痛' },
    { time: 45, text: '第二段主歌慢慢走远' },
    { time: 52, text: '灯火在夜色里闪烁' },
    { time: 60, text: '我只是可惜不太够时间去拥抱你' },
    { time: 66, text: '试着去忘记些什么' },
    { time: 72, text: '这阳台也让我很刺痛' },
  ];
  const chorus = detectLyricChorus(lines, 120);
  assert.deepEqual(chorus, { start: 22, end: 45 });
});
