'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { ErrorState } from '@/components/common/AsyncState';
import { staggerList } from '@/components/common/motion';
import { useNavigation } from '@/components/layout/navigation';
import { PlaylistCard } from '@/components/music/PlaylistCard';
import { SectionHeader } from '@/components/music/SectionHeader';
import { TrackTile } from '@/components/music/TrackTile';
import { usePlayer } from '@/components/player/player-store';
import { catalogApi, useCatalog } from '@/lib/catalog-client';
import { toTrack } from '@/lib/to-track';
import { PlaylistSkeleton, TrackSkeleton } from './skeletons';
import styles from './Home.module.css';

export function NewReleasesTab() {
  const player = usePlayer();
  const { navigate } = useNavigation();
  const { data, loading, error, retry } = useCatalog(catalogApi.newReleases, 'new-releases');
  const tracks = useMemo(() => (data?.tracks ?? []).map(toTrack), [data]);

  if (error) return <ErrorState message={error} onRetry={retry} />;

  return (
    <>
      <section className={styles.section}>
        <SectionHeader title="新歌首发" actionLabel="播放全部" onAction={() => tracks[0] && player.play(tracks[0], tracks)} />
        {loading || !data ? <TrackSkeleton count={9} /> : (
          <motion.div className={styles.trackGrid} variants={staggerList} initial="hidden" animate="show">
            {tracks.map(track => <TrackTile key={track.id} track={track} queue={tracks} />)}
          </motion.div>
        )}
      </section>
      <section className={styles.section}>
        <SectionHeader title="新碟上架" />
        {loading || !data ? <PlaylistSkeleton count={12} /> : (
          <motion.div className={styles.playlistGrid} variants={staggerList} initial="hidden" animate="show">
            {data.albums.map(album => (
              <PlaylistCard key={album.id} playlist={{ id: album.id, source: album.source, name: album.name, cover: album.cover, trackCount: album.trackCount }} subtitle={album.artist} onOpen={() => navigate({ name: 'album', id: album.id, title: album.name })} />
            ))}
          </motion.div>
        )}
      </section>
    </>
  );
}
