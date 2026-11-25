import type { PlayerState } from '@/components/player/player-types';
import { toTrack } from '@/lib/to-track';
import type { CatalogTrack } from '@/server/music/types';

/** Radio controls follow the live queue, including next/previous from the player bar. */
export function radioPlayback(songs: CatalogTrack[], player: Pick<PlayerState, 'radioSource' | 'track' | 'playing' | 'playRadio' | 'togglePlay'>) {
  const queue = songs.map(toTrack);
  if (!queue.length) return null;
  const current = player.radioSource === songs[0].source ? player.track : undefined;
  return {
    track: current ?? queue[0],
    playing: Boolean(current && player.playing),
    toggle: () => current ? player.togglePlay() : player.playRadio(queue),
  };
}
