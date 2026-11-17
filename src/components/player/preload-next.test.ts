import assert from 'node:assert/strict';
import test from 'node:test';
import type { Track } from '@/types/music';
import { clearPreloadedSources, pickNextTrack, rememberPreloadedSource, takePreloadedSource } from './preload-next';

const track = (id: string, playable = true): Track => ({
  id,
  title: id,
  artist: 'Artist',
  coverSeed: id,
  songId: playable ? id : undefined,
});

test('pickNextTrack wraps in loop mode and stops at end in order mode', () => {
  const queue = [track('a'), track('b'), track('c')];
  assert.equal(pickNextTrack(queue, 'a', 'loop')?.id, 'b');
  assert.equal(pickNextTrack(queue, 'c', 'loop')?.id, 'a');
  assert.equal(pickNextTrack(queue, 'c', 'order'), null);
});

test('pickNextTrack skips unplayable items and ignores shuffle / one', () => {
  const queue = [track('a'), track('unplayable', false), track('b')];
  assert.equal(pickNextTrack(queue, 'a', 'loop')?.id, 'b');
  assert.equal(pickNextTrack(queue, 'a', 'shuffle'), null);
  assert.equal(pickNextTrack(queue, 'a', 'one'), null);
});

test('preloaded source cache expires and is single-use', () => {
  clearPreloadedSources();
  const source = { id: 'a', url: 'https://example.com/a.mp3', level: 'standard' };
  rememberPreloadedSource('a', 'standard', source, 1000);
  assert.deepEqual(takePreloadedSource('a', 'standard', 2000), source);
  assert.equal(takePreloadedSource('a', 'standard', 2000), null);

  rememberPreloadedSource('b', 'exhigh', source, 1000);
  assert.equal(takePreloadedSource('b', 'exhigh', 1000 + 5 * 60 * 1000), null);
});
