'use client';

import { motion } from 'framer-motion';
import { ErrorState, SkeletonBlock } from '@/components/common/AsyncState';
import { staggerList } from '@/components/common/motion';
import { ArtistCard } from '@/components/music/ArtistCard';
import { SectionHeader } from '@/components/music/SectionHeader';
import { catalogApi, useCatalog } from '@/lib/catalog-client';
import styles from './Home.module.css';

export function ArtistsTab() {
  const { data, loading, error, retry } = useCatalog(catalogApi.artists, 'artists');
  if (error) return <ErrorState message={error} onRetry={retry} />;
  return (
    <section className={styles.section}>
      <SectionHeader title="热门歌手" />
      {loading || !data ? (
        <div className={styles.artistGrid} aria-busy="true">
          {Array.from({ length: 12 }, (_, index) => <SkeletonBlock key={index} className={styles.skeletonArtist} />)}
        </div>
      ) : (
        <motion.div className={styles.artistGrid} variants={staggerList} initial="hidden" animate="show">
          {data.artists.map(artist => <ArtistCard key={artist.id} artist={artist} />)}
        </motion.div>
      )}
    </section>
  );
}
