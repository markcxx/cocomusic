import { isSource } from '../music/ids';
import type { Track } from '../../types/music';
import type { PlaylistOrigin } from './types';

/** A stored track is a small object; anything bigger is not a track the app made. */
const MAX_TRACK_JSON = 8 * 1024;

/**
 * Player track from a request body or legacy storage, or null when malformed.
 * Both are untrusted (request bodies, user-editable files on disk).
 */
export function sanitizeTrack(value: unknown): Track | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const track = value as Partial<Track>;
  if (typeof track.id !== 'string' || !track.id || track.id.length > 200) return null;
  if (typeof track.title !== 'string' || typeof track.coverSeed !== 'string') return null;
  const clean = { ...track, artist: typeof track.artist === 'string' ? track.artist : '' } as Track;
  return JSON.stringify(clean).length > MAX_TRACK_JSON ? null : clean;
}

/** Well-formed tracks of a list, in order, at most `limit`. */
export function sanitizeTracks(values: unknown, limit: number): Track[] {
  if (!Array.isArray(values)) return [];
  const tracks: Track[] = [];
  for (const value of values) {
    if (tracks.length >= limit) break;
    const track = sanitizeTrack(value);
    if (track) tracks.push(track);
  }
  return tracks;
}

/** Where a 本地歌单 was copied from, or undefined when malformed. */
export function sanitizeOrigin(value: unknown): PlaylistOrigin | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const origin = value as Partial<PlaylistOrigin>;
  if (!isSource(origin.source) || typeof origin.id !== 'string' || !origin.id || origin.id.length > 100) return undefined;
  return { kind: origin.kind === 'album' ? 'album' : 'playlist', source: origin.source, id: origin.id };
}
