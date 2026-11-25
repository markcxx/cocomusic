import { useEffect, useRef } from 'react';
import { meApi } from '@/lib/me-client';
import { isPlayable, type Track } from '@/types/music';
import type { PlayMode } from './play-mode';
import { saveMode } from './player-prefs';

/** Queue saves are coalesced: a burst of edits (drag reorder, 加入队列 clicks) is one write. */
const QUEUE_SAVE_DELAY_MS = 600;
const POSITION_SAVE_INTERVAL_MS = 2000;

type Options = {
  queue: Track[];
  track: Track;
  position: number;
  mode: PlayMode;
  /** Saved volume and mode were read back; before that, writing would clobber them. */
  restored: boolean;
  /** The saved queue was read back; only then may changes overwrite it. */
  queueSynced: boolean;
};

/** Writes play mode, queue and playhead back as they change. Restoring them stays with the player. */
export function usePlayerPersistence({ queue, track, position, mode, restored, queueSynced }: Options) {
  useEffect(() => {
    if (!restored) return;
    saveMode(mode);
  }, [mode, restored]);

  useEffect(() => {
    if (!queueSynced) return;
    const timer = setTimeout(() => {
      meApi.saveQueue(queue, track.id).catch(error => console.error('[player] could not save the queue', error));
    }, QUEUE_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [queue, track.id, queueSynced]);

  // For 设置 › 播放 › 恢复播放进度.
  const positionSaved = useRef(0);
  useEffect(() => {
    if (!queueSynced || !isPlayable(track)) return;
    const now = Date.now();
    if (now - positionSaved.current < POSITION_SAVE_INTERVAL_MS && position > 0) return;
    positionSaved.current = now;
    meApi.savePosition({ id: track.id, t: Math.round(position) }).catch(() => undefined);
  }, [position, track, queueSynced]);
}
