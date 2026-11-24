import type { PlayerState } from '@/components/player/player-types';
import { toTrack } from '@/lib/to-track';
import type { CatalogTrack } from '@/server/music/types';

/** Radio controls follow the live queue, including next/previous from the player bar. */
export function radioPlayback(songs: CatalogTrack[], player: Pick<PlayerState, 'queue' | 'track' | 'playing' | 'play' | 'togglePlay'>) {
  const queue = songs.map(toTrack);
  if (!queue.length) return null;
  const current = queue.length === player.queue.length && queue.every((song, i) => song.id === player.queue[i].id)
    ? queue.find(song => song.id === player.track.id) : undefined;
  return {
    track: current ?? queue[0],
    playing: Boolean(current && player.playing),
    toggle: () => current ? player.togglePlay() : player.play(queue[0], queue, 'restart'),
  };
}
