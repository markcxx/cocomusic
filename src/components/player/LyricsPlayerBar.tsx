'use client';

import { ListMusic } from 'lucide-react';
import { useDesktopLyrics } from '@/components/desktop-lyrics/use-desktop-lyrics';
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
  const { track, queueOpen, setQueueOpen } = usePlayer();
  const stats = useSongStats(track.songId, track.source);
  const desktopLyrics = useDesktopLyrics();
  return (
    <footer className={styles.bar} aria-label="播放控制">
      <Progress />
      <div className={styles.row}>
        <div className={styles.side} />
        <Transport likeCount={stats.likeCount} large />
        <div className={`${styles.side} ${styles.tools}`}>
          <CommentButton count={stats.commentCount} onClick={onComments} disabled={!track.songId} />
          <VolumeControl />
          <IconButton label={desktopLyrics.visible ? '关闭桌面歌词' : '打开桌面歌词'} tone="muted" onClick={desktopLyrics.toggle} disabled={!desktopLyrics.available} active={desktopLyrics.visible} pressed={desktopLyrics.visible}>
            <span className={styles.ci}>词</span>
          </IconButton>
          <span data-queue-toggle style={{ display: 'inline-flex' }}>
            <IconButton label="播放列表" tone="muted" onClick={() => setQueueOpen(!queueOpen)} active={queueOpen} pressed={queueOpen}>
              <ListMusic size={19} strokeWidth={1.4} />
            </IconButton>
          </span>
        </div>
      </div>
    </footer>
  );
}
