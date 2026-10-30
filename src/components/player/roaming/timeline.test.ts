import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planShots } from './shots';
import { buildTimeline, framedStation, readPosition, splitUnits, stationAt, unitProgress } from './timeline';

test('karaoke units: CJK characters alone, Latin as words, spaces skipped', () => {
  assert.deepEqual(splitUnits('你好 world'), [{ text: '你', offset: 0 }, { text: '好', offset: 1 }, { text: 'world', offset: 3 }]);
  assert.deepEqual(splitUnits('I love you'), [{ text: 'I', offset: 0 }, { text: 'love', offset: 2 }, { text: 'you', offset: 7 }]);
});

test('lines without word timing spread their units over the line', () => {
  const [station] = buildTimeline([{ time: 10, text: '一二三四' }, { time: 14, text: '下一句' }], 60);
  assert.equal(station.units.length, 4);
  assert.equal(station.units[0].start, 10);
  assert.equal(station.units[3].end, 14);
  assert.equal(unitProgress(station.units[1], 11.5), 0.5);
});

test('word timing drives the units', () => {
  const [station] = buildTimeline([{ time: 0, text: 'ab cd', words: [{ start: 0, end: 1, text: 'ab ' }, { start: 1, end: 3, text: 'cd' }] }], 10);
  assert.equal(station.units.length, 2);
  assert.equal(station.units[1].start, 1);
  assert.equal(station.units[1].end, 3);
  assert.ok(readPosition(station, 2) > 0.5);
});

test('filler lines are never framed; the camera stays on the last real line', () => {
  const stations = buildTimeline([{ time: 0, text: '第一句' }, { time: 5, text: '……' }, { time: 20, text: '第三句' }], 40);
  assert.equal(stationAt(stations, 8), 1);
  assert.equal(framedStation(stations, 8), 0);
  assert.equal(framedStation(stations, 21), 2);
});

test('repeated lines are marked as chorus', () => {
  const stations = buildTimeline([{ time: 0, text: '我们的爱' }, { time: 4, text: '别的歌词' }, { time: 8, text: '我们的爱' }], 20);
  assert.equal(stations[0].chorus, true);
  assert.equal(stations[1].chorus, false);
});

test('shot plan is deterministic and never repeats within three lines', () => {
  const lines = Array.from({ length: 40 }, (_, i) => ({ time: i * 3, text: `歌词第${i}行内容` }));
  const stations = buildTimeline(lines, 200);
  const a = planShots(stations, 42, 'normal');
  const b = planShots(stations, 42, 'normal');
  assert.deepEqual(a, b);
  for (let i = 0; i < a.length; i += 1) {
    for (let j = Math.max(0, i - 3); j < i; j += 1) assert.notEqual(a[i].name, a[j].name, `line ${i} repeats line ${j}`);
  }
});
