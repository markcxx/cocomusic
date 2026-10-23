'use client';

import { ListMusic } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { CommentButton, Transport, VolumeControl } from './controls';
import { formatTime, usePlaybackPosition, usePlayer } from './player-store';
import { useSongStats } from './use-song-stats';
import { Slider } from '@/components/ui';
import styles from './LyricsPlayerBar.module.css';

function Progress() {
  const { duration, seek, trial } = usePlayer();
  const position = usePlaybackPosition();
  return (
    <div className={styles.progress}>
      <time>{formatTime(position)}</time>
      <Slider value={Math.min(position, duration)} max={duration} onCommit={seek} label="播放进度" formatValue={formatTime} />
      <time data-tooltip={trial ? '试听片段' : undefined}>{formatTime(duration)}</time>
    </div>
  );
}

/**
 * Player bar for the lyrics page: no track card (the page already shows it),
 * a full-width progress line on top, larger centred transport, and tools on
 * the right. Transparent over the blurred artwork, dark-themed.
 */
export function LyricsPlayerBar({ onComments }: { onComments: () => void }) {
  const { track } = usePlayer();
  const stats = useSongStats(track.songId);
  return (
    <footer className={styles.bar} aria-label="播放控制">
      <Progress />
      <div className={styles.row}>
        <div className={styles.side} />
        <Transport likeCount={stats.likeCount} large />
        <div className={`${styles.side} ${styles.tools}`}>
          <CommentButton count={stats.commentCount} onClick={onComments} disabled={!track.songId} />
          <VolumeControl />
          <IconButton label="播放队列" tooltip="播放队列（即将接入）" tone="muted">
            <ListMusic size={19} strokeWidth={1.4} />
          </IconButton>
        </div>
      </div>
    </footer>
  );
}
