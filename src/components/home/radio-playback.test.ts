import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toTrack } from '@/lib/to-track';
import type { CatalogTrack } from '@/server/music/types';
import { radioPlayback } from './radio-playback';

test('the radio button follows the active queue, current song and transport controls', () => {
  const songs: CatalogTrack[] = ['first', 'second'].map(id => ({ id, source: 'qq', title: id, artist: 'artist' }));
  const queue = songs.map(toTrack);
  const player = {
    track: queue[0], queue: [queue[0]], playing: true,
    togglePlay: () => { player.playing = !player.playing; },
    play: (first: typeof queue[number], tracks = queue, ifCurrent?: string) => {
      assert.equal(ifCurrent, 'restart');
      player.queue = tracks;
      player.track = first;
      player.playing = true;
    },
  };
  const card = () => radioPlayback(songs, player)!;
  assert.equal(card().playing, false); // Another queue happens to contain the same song.
  card().toggle();
  assert.equal(card().playing, true);
  player.track = queue[1];
  assert.equal(card().track.id, queue[1].id);
  card().toggle();
  assert.equal(card().playing, false);
  card().toggle();
  assert.equal(card().playing, true);
  assert.equal(player.track.id, queue[1].id);
  player.togglePlay();
  assert.equal(card().playing, false);
  assert.equal(radioPlayback([], player), null);
});
