'use client';

import { Copy, Download, Link2, ListMusic, MoreHorizontal, Settings2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { LikeButton } from '@/components/account/LikeButton';
import { useDesktopLyrics } from '@/components/desktop-lyrics/use-desktop-lyrics';
import { downloads } from '@/components/downloads/download-store';
import { useNavigation } from '@/components/layout/navigation';
import { IconButton, Menu, Slider, toast, type MenuItem } from '@/components/ui';
import { shareUrl } from '@/lib/share-links';
import type { CatalogTrack } from '@/server/music/types';
import { CommentButton, PlayModeButton, PlayPauseButton, SkipButton, VolumeControl } from './controls';
import { AddToPlaylistButton } from './AddToPlaylistButton';
import { MvButton } from './mv/MvButton';
import { formatTime, usePlaybackPosition, usePlayer } from './player-store';
import { QualityBadge } from './QualityBadge';
import { useProgressScrubber } from './use-progress-scrubber';
import { useSongStats } from './use-song-stats';
import styles from './LyricsPlayerBar.module.css';

/** Thin full-width progress line along the bar's top edge; the time + lyric line show in the thumb tooltip. */
function Progress() {
  const { duration, seek } = usePlayer();
  const position = usePlaybackPosition();
  const { highlights, renderTooltip } = useProgressScrubber();
  return (
    <div className={styles.progress} data-lyrics-progress>
      <Slider
        value={Math.min(position, duration)}
        max={duration}
        onCommit={seek}
        label="播放进度"
        formatValue={formatTime}
        highlights={highlights}
        renderTooltip={renderTooltip}
        size="sm"
      />
    </div>
  );
}

/** The playing song as a catalog track (for the download action). */
function useCatalogTrack(): CatalogTrack | null {
  const { track } = usePlayer();
  if (!track.songId) return null;
  return { id: track.songId, source: track.source ?? 'netease', title: track.title, artist: track.artist, album: track.album, albumId: track.albumId, cover: track.cover, duration: track.duration };
}

function MoreButton() {
  const player = usePlayer();
  const { navigate } = useNavigation();
  const song = useCatalogTrack();
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const copy = async (text: string, done: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(done); } catch { toast.error('复制失败'); }
  };
  const items: MenuItem[] = [
    { label: '下载', icon: <Download size={15} strokeWidth={1.5} />, disabled: !song, onSelect: () => { if (song) void downloads.add([song]); } },
    { label: '复制分享链接', icon: <Link2 size={15} strokeWidth={1.5} />, disabled: !song, onSelect: () => { if (song) void copy(shareUrl(song.source, 'song', song.id), '链接已复制'); } },
    { label: '复制歌曲信息', icon: <Copy size={15} strokeWidth={1.5} />, onSelect: () => void copy(`${player.track.title} - ${player.track.artist}`, '已复制') },
    { type: 'divider' },
    { label: '歌词页设置', icon: <Settings2 size={15} strokeWidth={1.5} />, onSelect: () => { player.closeLyrics(); navigate({ name: 'settings' }); } },
  ];
  return (
    <>
      <span ref={anchor} style={{ display: 'inline-flex' }}>
        <IconButton label="更多" tone="muted" onClick={() => setOpen(value => !value)} active={open}>
          <MoreHorizontal size={19} strokeWidth={1.4} />
        </IconButton>
      </span>
      <Menu open={open} anchor={anchor} items={items} onClose={() => setOpen(false)} align="end" />
    </>
  );
}

/**
 * Player bar for the lyrics page, laid out like a desktop client's bar:
 * song + like/comments on the left, transport + queue centred on the window,
 * quality / collect / desktop lyrics / volume / more on the right, and a thin
 * progress line along the top edge (no time labels).
 */
export function LyricsPlayerBar({ onComments }: { onComments: () => void }) {
  const player = usePlayer();
  const { track, queueOpen, setQueueOpen } = player;
  const stats = useSongStats(track.songId, track.source);
  const desktopLyrics = useDesktopLyrics();
  return (
    <footer className={styles.bar} data-player-bar aria-label="播放控制">
      <Progress />
      <div className={styles.row}>
        <div className={styles.song}>
          <span className={styles.meta}>
            <strong data-tooltip={track.title} data-tooltip-overflow>{track.title}</strong>
            <small data-tooltip={track.artist} data-tooltip-overflow>{track.artist}</small>
          </span>
          {track.songId && <LikeButton songId={track.songId} title={track.title} source={track.source} size="md" iconSize={19} count={stats.likeCount} />}
          <CommentButton count={stats.commentCount} onClick={onComments} disabled={!track.songId} />
        </div>

        <div className={styles.transport}>
          <PlayModeButton />
          {/* Same skip buttons as the main player bar. */}
          <SkipButton direction="previous" />
          <PlayPauseButton large />
          <SkipButton direction="next" />
          <span data-queue-toggle style={{ display: 'inline-flex' }}>
            <IconButton label="播放列表" tone="muted" onClick={() => setQueueOpen(!queueOpen)} active={queueOpen} pressed={queueOpen}>
              <ListMusic size={20} strokeWidth={1.4} />
            </IconButton>
          </span>
        </div>

        <div className={styles.tools}>
          <QualityBadge />
          <MvButton />
          <AddToPlaylistButton />
          <IconButton label={desktopLyrics.visible ? '关闭桌面歌词' : '打开桌面歌词'} tone="muted" onClick={desktopLyrics.toggle} disabled={!desktopLyrics.available} active={desktopLyrics.visible} pressed={desktopLyrics.visible}>
            <span className={styles.ci}>词</span>
          </IconButton>
          <VolumeControl />
          <MoreButton />
        </div>
      </div>
    </footer>
  );
}
