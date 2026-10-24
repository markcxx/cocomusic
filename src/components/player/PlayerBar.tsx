'use client';

import { ListMusic } from 'lucide-react';
import { useDesktopLyrics } from '@/components/desktop-lyrics/use-desktop-lyrics';
import { useNavigation } from '@/components/layout/navigation';
import { IconButton } from '@/components/ui';
import { CommentButton, Transport, VolumeControl } from './controls';
import { usePlayer } from './player-store';
import { ProgressBar } from './ProgressBar';
import { TrackInfo } from './TrackInfo';
import { useSongStats } from './use-song-stats';
import styles from './PlayerBar.module.css';

/**
 * Full-bleed three-zone player fixed to the window bottom. The middle zone is
 * centered on the whole window: left and right zones are equal grid tracks.
 * Hidden while the lyrics page is open; that page has its own bar.
 */
export function PlayerBar() {
  const player = usePlayer();
  const { route, navigate } = useNavigation();
  const { track } = player;
  const stats = useSongStats(track.songId);
  const desktopLyrics = useDesktopLyrics();
  const viewingComments = route.name === 'comments' && route.songId === track.songId;

  const openComments = () => {
    if (!track.songId) return;
    navigate({ name: 'comments', songId: track.songId, title: track.title, artist: track.artist, cover: track.cover });
  };

  return (
    <footer className={styles.player} aria-label="播放控制" inert={player.lyricsOpen}>
      <div className={styles.nowPlaying}>
        <TrackInfo />
      </div>

      <div className={styles.transport}>
        <Transport likeCount={stats.likeCount} />
        <ProgressBar />
      </div>

      <div className={styles.tools}>
        <CommentButton count={stats.commentCount} onClick={openComments} disabled={!track.songId} active={viewingComments} />
        <VolumeControl />
        <IconButton
          label={desktopLyrics.available ? (desktopLyrics.visible ? '关闭桌面歌词' : '打开桌面歌词') : '桌面歌词'}
          tooltip={desktopLyrics.available ? undefined : '桌面歌词需要在桌面客户端中使用'}
          className={styles.lyricButton}
          onClick={desktopLyrics.toggle}
          disabled={!desktopLyrics.available}
          active={desktopLyrics.visible}
          pressed={desktopLyrics.visible}
        >
          词
        </IconButton>
        <span data-queue-toggle style={{ display: 'inline-flex' }}>
          <IconButton label="播放列表" tooltip={`播放列表${player.queue.length ? ` · ${player.queue.length} 首` : ''}`} onClick={() => player.setQueueOpen(!player.queueOpen)} active={player.queueOpen} pressed={player.queueOpen}>
            <ListMusic size={19} strokeWidth={1.4} />
          </IconButton>
        </span>
      </div>
    </footer>
  );
}
