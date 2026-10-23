'use client';

import { ListMusic } from 'lucide-react';
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
        <IconButton label="歌词" className={styles.lyricButton} onClick={player.openLyrics}>词</IconButton>
        <IconButton label="播放队列" tooltip="播放队列（即将接入）">
          <ListMusic size={19} strokeWidth={1.4} />
        </IconButton>
      </div>
    </footer>
  );
}
