'use client';
import { useNavigation } from '@/components/layout/navigation';
import { IconButton } from '@/components/ui';
import { usePlayer } from '../player-store';
import styles from '../controls.module.css';

/** Opens the current song's MV page in the main sheet (closing the lyrics page if open). */
export function MvButton() {
  const player = usePlayer();
  const { route, navigate } = useNavigation();
  const { track } = player;
  const viewing = route.name === 'mv' && route.songId === track.songId && (route.source ?? 'netease') === (track.source ?? 'netease');
  return (
    <IconButton
      label="观看 MV"
      tone="muted"
      disabled={!track.songId}
      active={viewing}
      onClick={() => {
        if (!track.songId) return;
        player.closeLyrics();
        navigate({ name: 'mv', songId: track.songId, source: track.source, title: track.title, artist: track.artist, cover: track.cover });
      }}
    >
      <span className={styles.mvGlyph}>MV</span>
    </IconButton>
  );
}
