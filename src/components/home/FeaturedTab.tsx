'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { ErrorState } from '@/components/common/AsyncState';
import { staggerList } from '@/components/common/motion';
import { useNavigation } from '@/components/layout/navigation';
import { ChartCard } from '@/components/music/ChartCard';
import { PlaylistCard } from '@/components/music/PlaylistCard';
import { SectionHeader } from '@/components/music/SectionHeader';
import { TrackTile } from '@/components/music/TrackTile';
import { usePlayer } from '@/components/player/player-store';
import { catalogApi, useCatalog } from '@/lib/catalog-client';
import { toTrack } from '@/lib/to-track';
import { ChartSkeleton, PlaylistSkeleton, TrackSkeleton } from './skeletons';
import styles from './Home.module.css';

export function FeaturedTab() {
  const { navigate } = useNavigation();
  const player = usePlayer();
  const { data, loading, error, retry } = useCatalog(catalogApi.featured, 'featured');
  const tracks = useMemo(() => (data?.tracks ?? []).map(toTrack), [data]);

  if (error) return <ErrorState message={error} onRetry={retry} />;

  return (
    <>
      <section className={styles.section}>
        <SectionHeader title="推荐歌单" actionLabel="歌单广场" onAction={() => navigate({ name: 'discover' })} />
        {loading || !data ? <PlaylistSkeleton count={12} /> : (
          <motion.div className={styles.playlistGrid} variants={staggerList} initial="hidden" animate="show">
            {data.playlists.map(playlist => (
              <PlaylistCard key={playlist.id} playlist={playlist} onOpen={() => navigate({ name: 'playlist', id: playlist.id, title: playlist.name })} onPlay={() => tracks[0] && player.play(tracks[0], tracks)} />
            ))}
          </motion.div>
        )}
      </section>

      <section className={styles.section}>
        <SectionHeader title="推荐歌曲" actionLabel="播放全部" onAction={() => tracks[0] && player.play(tracks[0], tracks)} />
        {loading || !data ? <TrackSkeleton count={9} /> : (
          <motion.div className={styles.trackGrid} variants={staggerList} initial="hidden" animate="show">
            {tracks.map(track => <TrackTile key={track.id} track={track} queue={tracks} />)}
          </motion.div>
        )}
      </section>

      <section className={styles.section}>
        <SectionHeader title="热门榜单" actionLabel="查看全部" onAction={() => navigate({ name: 'charts' })} />
        {loading || !data ? <ChartSkeleton count={2} /> : (
          <motion.div className={styles.chartGrid} variants={staggerList} initial="hidden" animate="show">
            {data.charts.map(chart => <ChartCard key={chart.id} chart={chart} />)}
          </motion.div>
        )}
      </section>
    </>
  );
}
