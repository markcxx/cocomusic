import { QUEUE_LIMIT } from '@/server/user-data/types';
import type { Track } from '@/types/music';

export const capQueue = (list: readonly Track[]) => list.slice(0, QUEUE_LIMIT);

/** Put `track` right after the current song, moving it if it was already queued. */
export function insertAfterCurrent(queue: readonly Track[], currentId: string, track: Track) {
  const rest = queue.filter(item => item.id !== track.id);
  const at = rest.findIndex(item => item.id === currentId) + 1;
  return [...rest.slice(0, at), track, ...rest.slice(at)];
}

/** Append, skipping songs already in the queue. */
export function appendTracks(queue: readonly Track[], tracks: readonly Track[]) {
  const known = new Set(queue.map(item => item.id));
  return capQueue([...queue, ...tracks.filter(item => !known.has(item.id))]);
}

/** 下一首播放: move `tracks` (in order) right after the current song; the current song stays put. */
export function playNextTracks(queue: readonly Track[], currentId: string, tracks: readonly Track[]) {
  const ids = new Set(tracks.map(item => item.id));
  const rest = queue.filter(item => !ids.has(item.id) || item.id === currentId);
  const at = rest.findIndex(item => item.id === currentId) + 1;
  return capQueue([...rest.slice(0, at), ...tracks.filter(item => item.id !== currentId), ...rest.slice(at)]);
}

export function moveTrack(queue: Track[], id: string, toIndex: number) {
  const from = queue.findIndex(item => item.id === id);
  if (from < 0) return queue;
  const copy = queue.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(Math.max(0, Math.min(copy.length, toIndex)), 0, item);
  return copy;
}
