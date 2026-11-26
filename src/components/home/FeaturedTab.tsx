'use client';

import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAccount } from '@/components/account/account-store';
import { ErrorState } from '@/components/common/AsyncState';
import { staggerList } from '@/components/common/motion';
import { useNavigation } from '@/components/layout/navigation';
import { ChartCard } from '@/components/music/ChartCard';
import { PlaylistCard } from '@/components/music/PlaylistCard';
import { SectionHeader } from '@/components/music/SectionHeader';
import { TrackTile } from '@/components/music/TrackTile';
import { usePlayer } from '@/components/player/player-store';
import { Button, toast } from '@/components/ui';
import { catalogApi, useCatalog, type CatalogPlaylist } from '@/lib/catalog-client';
import { fetchCollectionTracks } from '@/lib/collection-tracks';
import { QUEUE_LIMIT } from '@/lib/me-client';
import { useSettings } from '@/lib/settings';
import { toTrack } from '@/lib/to-track';
import { BentoHero, BentoSkeleton } from './BentoHero';
import { dailySongsTitle, useRecommendationDay } from './DailySongs';
import { ChartSkeleton, PlaylistSkeleton, TrackSkeleton } from './skeletons';
import styles from './Home.module.css';

export function FeaturedTab() {
  const { profile } = useAccount();
  const source = useSettings().catalogSource;
  const viewer = profile?.source === source ? profile.id : 'guest';
  const day = useRecommendationDay();
  const { navigate } = useNavigation();
  const player = usePlayer();
  const [batch, setBatch] = useState(0);
  const recommendationKey = viewer !== 'guest' ? `${viewer}:${day}` : 'public';
  const { data, loading, error, retry } = useCatalog(signal => catalogApi.featured(signal, batch > 0), `featured:${recommendationKey}:${batch}`);
  const tracks = useMemo(() => (data?.tracks ?? []).map(toTrack), [data]);

  if (error) return <ErrorState message={error} onRetry={retry} />;

  const playPlaylist = async (playlist: CatalogPlaylist) => {
    try {
      const queue = await fetchCollectionTracks({ kind: 'playlist', id: playlist.id, source: playlist.source }, [], QUEUE_LIMIT);
      if (queue.length) player.play(queue[0], queue);
      else toast.info('这个歌单暂无歌曲');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '歌单加载失败');
    }
  };

  const recommendationCards = data?.recommendationCards;
  const hasShelfCards = Boolean(recommendationCards?.length);
  const songsFirst = source === 'netease' || (data?.dailySongs ?? (viewer !== 'guest'));
  const songs = tracks.length > 0 || loading ? (
    <section className={styles.section}>
      <SectionHeader
        title={data?.dailySongs ? dailySongsTitle(source) : '推荐歌曲'}
        actionLabel={data?.dailySongs ? '查看全部' : '播放全部'}
        onAction={() => data?.dailySongs ? navigate({ name: 'daily-songs' }) : tracks[0] && player.play(tracks[0], tracks)}
      >
        {data?.dailySongs && <Button variant="ghost" disabled={!tracks.length} onClick={() => player.play(tracks[0], tracks)}>播放全部</Button>}
      </SectionHeader>
      {loading || !data ? <TrackSkeleton count={9} /> : !tracks.length ? null : (
        <motion.div className={styles.trackGrid} variants={staggerList} initial="hidden" animate="show">
          {(data.dailySongs ? tracks.slice(0, 9) : tracks).map(track => <TrackTile key={track.id} track={track} queue={tracks} />)}
        </motion.div>
      )}
    </section>
  ) : null;

  return (
    <>
      {loading && !data ? (
        <BentoSkeleton />
      ) : data && (
        <BentoHero
          source={source}
          dailyMode={Boolean(data.dailySongs)}
          cards={recommendationCards}
          tracks={tracks}
          playlists={data.playlists}
          charts={data.charts}
          playPlaylist={playPlaylist}
        />
      )}

      {!hasShelfCards && songsFirst && songs}

      <section className={styles.section}>
        <SectionHeader title={data?.dailyPlaylists ? '每日推荐歌单' : '推荐歌单'} actionLabel="歌单广场" onAction={() => navigate({ name: 'discover' })}>
          {!data?.dailyPlaylists && <Button variant="ghost" icon={<RefreshCw size={13} strokeWidth={1.6} />} disabled={loading} onClick={() => setBatch(value => value + 1)}>
            换一批
          </Button>}
        </SectionHeader>
        {loading || !data ? <PlaylistSkeleton count={12} /> : !data.playlists.length ? <span>暂无推荐歌单</span> : (
          <motion.div className={styles.playlistGrid} variants={staggerList} initial="hidden" animate="show">
            {data.playlists.map(playlist => (
              <PlaylistCard key={playlist.id} playlist={playlist} onOpen={() => navigate({ name: 'playlist', id: playlist.id, source: playlist.source, title: playlist.name })} onPlay={playPlaylist} />
            ))}
          </motion.div>
        )}
      </section>

      {!hasShelfCards && !songsFirst && songs}

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
