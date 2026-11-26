'use client';

import { Flame } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import type { SliderHighlight } from '@/components/ui/Slider';
import { useSettings } from '@/lib/settings';
import { activeLineIndex, detectLyricChorus } from '@/server/music/lrc';
import { formatTime, usePlayer } from './player-store';
import { useTrackLyrics } from './use-track-lyrics';
import styles from './ProgressScrubber.module.css';

/**
 * Computes rail highlights (chorus peak / trial clip) and the rich lyric-scrubbing
 * tooltip for both the main PlayerBar and LyricsPlayerBar.
 */
export function useProgressScrubber() {
  const { track, duration, trial, chorus } = usePlayer();
  const lyrics = useTrackLyrics(track);
  const { lyricsOffset } = useSettings();
  const lines = useMemo(() => lyrics.data?.lines ?? [], [lyrics.data]);
  const synced = Boolean(lyrics.data?.synced);

  // Upstream chorus wins; otherwise infer the repeated chorus hook from synced lyrics.
  const activeChorus = useMemo(() => {
    if (trial || duration <= 20) return undefined;
    const candidate = chorus ?? (synced ? detectLyricChorus(lines, duration) : undefined);
    if (!candidate) return undefined;
    const start = Math.max(0, candidate.start);
    const end = Math.min(duration, candidate.end);
    return end - start >= 8 && start < duration ? { start, end } : undefined;
  }, [trial, duration, chorus, synced, lines]);

  const highlights = useMemo<SliderHighlight[]>(() => {
    if (duration <= 0) return [];
    if (trial) return [{ start: 0, end: duration, kind: 'trial' }];
    if (activeChorus) return [{ start: activeChorus.start, end: activeChorus.end, kind: 'chorus' }];
    return [];
  }, [duration, trial, activeChorus]);

  const fullSongDuration = track.duration && track.duration > duration ? track.duration : trial ? Math.max(trial.end, duration) : 0;

  const renderTooltip = useCallback((seconds: number) => {
    const songTime = seconds + (trial?.start ?? 0);
    const idx = synced ? activeLineIndex(lines, songTime + lyricsOffset) : -1;
    const lyricText = idx >= 0 ? lines[idx]?.text : undefined;
    const inChorus = Boolean(activeChorus && seconds >= activeChorus.start && seconds <= activeChorus.end);

    return (
      <div className={styles.scrubber}>
        <div className={styles.topRow}>
          <span className={styles.time}>
            {formatTime(seconds)}
            {trial && <small className={styles.fullTime}> / 原曲 {formatTime(songTime)}</small>}
          </span>
          {inChorus && (
            <span className={styles.chorusTag}>
              <Flame size={10} fill="currentColor" strokeWidth={0} />
              <span>副歌高潮</span>
            </span>
          )}
          {trial && (
            <span className={styles.trialTag}>
              试听 {formatTime(trial.start)}–{formatTime(trial.end)}
            </span>
          )}
        </div>

        {trial && fullSongDuration > 0 && (
          <div className={styles.songMap} aria-hidden>
            <span
              className={styles.songMapWindow}
              style={{
                left: `${Math.min(100, (trial.start / fullSongDuration) * 100).toFixed(1)}%`,
                width: `${Math.max(6, ((trial.end - trial.start) / fullSongDuration) * 100).toFixed(1)}%`,
              }}
            />
          </div>
        )}

        {lyricText && <p className={styles.lyricPreview}>{lyricText}</p>}
      </div>
    );
  }, [trial, synced, lines, lyricsOffset, activeChorus, fullSongDuration]);

  return { highlights, renderTooltip, activeChorus };
}
