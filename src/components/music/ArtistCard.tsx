'use client';

import { motion } from 'framer-motion';
import { Cover } from '@/components/common/Cover';
import { riseItem } from '@/components/common/motion';
import { useNavigation } from '@/components/layout/navigation';
import type { CatalogArtist } from '@/lib/catalog-client';
import styles from './ArtistCard.module.css';

/** Round avatar; hover darkens it. Click opens the artist page. */
export function ArtistCard({ artist }: { artist: CatalogArtist }) {
  const { navigate } = useNavigation();
  const meta = [artist.songCount ? `${artist.songCount} 首歌曲` : '', artist.albumCount ? `${artist.albumCount} 张专辑` : ''].filter(Boolean).join(' · ');
  return (
    <motion.button type="button" className={styles.artist} variants={riseItem} aria-label={`查看歌手：${artist.name}`} onClick={() => navigate({ name: 'artist', id: artist.id, title: artist.name })}>
      <span className={styles.avatar}>
        <Cover seed={`${artist.source}:artist:${artist.id}`} src={artist.avatar} className={styles.cover} radius={999} />
        <span className={styles.scrim} aria-hidden />
      </span>
      <strong>{artist.name}</strong>
      {meta && <span className={styles.meta}>{meta}</span>}
    </motion.button>
  );
}
