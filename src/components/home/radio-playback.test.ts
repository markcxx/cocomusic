import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toTrack } from '@/lib/to-track';
import type { CatalogTrack } from '@/server/music/types';
import { radioPlayback } from './radio-playback';

test('the radio button follows the active queue, current song and transport controls', () => {
  const songs: CatalogTrack[] = ['first', 'second'].map(id => ({ id, source: 'qq', title: id, artist: 'artist' }));
  const queue = songs.map(toTrack);
  const player = {
    track: queue[0], radioSource: null as CatalogTrack['source'] | null, queue: [queue[0]], playing: true,
    togglePlay: () => { player.playing = !player.playing; },
    playRadio: (tracks: typeof queue) => {
      player.radioSource = tracks[0].source!;
      player.queue = tracks;
      player.track = tracks[0];
      player.playing = true;
    },
  };
  const card = () => radioPlayback(songs, player)!;
  assert.equal(card().playing, false); // Another queue happens to contain the same song.
  card().toggle();
  assert.equal(card().playing, true);
  player.queue = [...queue, { ...queue[1], id: 'qq:third' }];
  player.track = player.queue[2];
  assert.equal(card().track.id, 'qq:third');
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

for (const source of ['qq', 'netease'] as const) {
  test(`${source} radio fetches past the preview, skips repeated batches and keeps the station source`, async t => {
    const { nextRadioBatch } = await import('../player/radio-queue');
    const song = (id: string): CatalogTrack => ({ id, source, title: id, artist: 'artist' });
    const queue = ['1', '2', '3'].map(id => toTrack(song(id)));
    const batches = [['1', '2', '3'], ['3', '4', '4', '5'], ['5', '6']];
    const fetch = t.mock.method(globalThis, 'fetch', async (url: string) => {
      const query = new URL(url, 'http://localhost').searchParams;
      assert.equal(query.get('source'), source);
      assert.equal(query.get('section'), 'radio');
      return Response.json({ tracks: (batches.shift() ?? ['1']).map(song) });
    });
    const signal = new AbortController().signal;
    queue.push(...await nextRadioBatch(source, queue, signal));
    queue.push(...await nextRadioBatch(source, queue, signal));
    assert.deepEqual(queue.map(track => track.songId), ['1', '2', '3', '4', '5', '6']);
    await assert.rejects(nextRadioBatch(source, queue, signal), /没有推荐新歌/);
    assert.equal(fetch.mock.callCount(), 6);
  });
}
