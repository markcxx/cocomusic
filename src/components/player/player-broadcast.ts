'use client';

import type { SongSource } from '@/lib/catalog-client';
import type { Track } from '@/types/music';

/**
 * Player → other windows (desktop lyrics). Both windows load the same origin,
 * so a BroadcastChannel reaches every renderer without going through the main
 * process. The main window is the single source of truth; followers send
 * commands back and ask for a `sync` when they open.
 */

export type PlayerMessage =
  | { type: 'track'; track: Pick<Track, 'id' | 'title' | 'artist' | 'songId' | 'localId' | 'source' | 'trialClip'>; trialStart: number }
  /** Song position at `at` (performance.timeOrigin + now), so followers can extrapolate smoothly. */
  | { type: 'clock'; position: number; playing: boolean; at: number }
  | { type: 'command'; command: PlayerCommand };

export type PlayerCommand = 'toggle' | 'next' | 'previous' | 'sync';

const NAME = 'coco:player';
let channel: BroadcastChannel | null = null;
const open = () => {
  if (typeof BroadcastChannel === 'undefined') return null;
  channel ??= new BroadcastChannel(NAME);
  return channel;
};

const wallNow = () => performance.timeOrigin + performance.now();
let lastTrackKey = '';
let lastClock = { position: -1, playing: false, sent: 0 };

export const broadcastPlayer = {
  publishTrack(track: Track, trial: SongSource['trial'], force = false) {
    const key = `${track.id}|${trial?.start ?? 0}`;
    if (!force && key === lastTrackKey) return;
    lastTrackKey = key;
    open()?.postMessage({ type: 'track', track: { id: track.id, title: track.title, artist: track.artist, songId: track.songId, localId: track.localId, source: track.source, trialClip: track.trialClip }, trialStart: trial?.start ?? 0 } satisfies PlayerMessage);
  },
  /** Throttled: followers extrapolate between ticks, so ~4/s is plenty (plus on every play/pause or seek). */
  publishClock(position: number, playing: boolean) {
    const now = wallNow();
    const jumped = Math.abs(position - (lastClock.position + (playing ? (now - lastClock.sent) / 1000 : 0))) > 0.5;
    if (playing === lastClock.playing && !jumped && now - lastClock.sent < 250) return;
    lastClock = { position, playing, sent: now };
    open()?.postMessage({ type: 'clock', position, playing, at: now } satisfies PlayerMessage);
  },
  onCommand(listener: (command: PlayerCommand) => void) {
    const target = open();
    if (!target) return () => undefined;
    const handler = (event: MessageEvent<PlayerMessage>) => { if (event.data?.type === 'command') listener(event.data.command); };
    target.addEventListener('message', handler);
    return () => target.removeEventListener('message', handler);
  },
};

/** Follower side (desktop lyrics). */
export const playerFollower = {
  send(command: PlayerCommand) { open()?.postMessage({ type: 'command', command } satisfies PlayerMessage); },
  subscribe(listener: (message: PlayerMessage) => void) {
    const target = open();
    if (!target) return () => undefined;
    const handler = (event: MessageEvent<PlayerMessage>) => { if (event.data && event.data.type !== 'command') listener(event.data); };
    target.addEventListener('message', handler);
    return () => target.removeEventListener('message', handler);
  },
  now: wallNow,
};
