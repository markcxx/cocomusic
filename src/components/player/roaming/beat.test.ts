import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BeatTracker } from './beat';

const frame = (level: number) => new Uint8Array(1024).fill(level);

test('a sudden bass rise is a beat; the hop rises and settles back', () => {
  const beat = new BeatTracker();
  for (let i = 0; i < 120; i += 1) beat.update(frame(60), 48000, 1 / 60);
  assert.ok(beat.hop < 0.05, 'steady level: no hop');
  for (let i = 0; i < 6; i += 1) beat.update(frame(230), 48000, 1 / 60);
  const peak = beat.hop;
  assert.ok(peak > 0.4, `hop after a hit: ${peak}`);
  for (let i = 0; i < 90; i += 1) beat.update(frame(60), 48000, 1 / 60);
  assert.ok(beat.hop < 0.05, 'hop settles once the hit passes');
});

test('paused: no beats, the hop falls back to rest', () => {
  const beat = new BeatTracker();
  beat.pulse = 1;
  for (let i = 0; i < 120; i += 1) beat.update(null, 48000, 1 / 60);
  assert.ok(beat.hop < 0.01);
  assert.equal(beat.strong, false);
});
