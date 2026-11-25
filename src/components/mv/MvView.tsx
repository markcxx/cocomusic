'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Film, MessageCircleMore, Music2, RefreshCw, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { CommentList, commentSortKey, commentSorts, type CommentSortLabel } from '@/components/comments/CommentList';
import { SkeletonBlock } from '@/components/common/AsyncState';
import { Cover } from '@/components/common/Cover';
import { fadeSwap } from '@/components/common/motion';
import { Tabs } from '@/components/common/Tabs';
import { useNavigation } from '@/components/layout/navigation';
import { MvVideoPlayer } from '@/components/player/mv/MvVideoPlayer';
import playerStyles from '@/components/player/mv/MvVideoPlayer.module.css';
import { usePlayer } from '@/components/player/player-store';
import { Page, StickyBar } from '@/components/scroll';
import { Button, Spinner } from '@/components/ui';
import { mvApi, type CatalogSource, type MusicVideo } from '@/lib/catalog-client';
import { useLatest } from '@/lib/use-latest';
import { SOURCE_NAMES } from '@/server/music/ids';
import { MV_FEATURES } from '@/server/music/mv-features';
import { MvList } from './MvGrid';
import styles from './MvView.module.css';

type Props = { songId?: string; mvId?: string; source?: CatalogSource; title?: string; artist?: string; artistId?: string; cover?: string };

/** Loads the song's official MV, or the video picked from a list; `attempt` re-runs the request. */
function useMusicVideo(songId: string | undefined, mvId: string | undefined, source: CatalogSource) {
  const [mv, setMv] = useState<MusicVideo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void mvApi.video({ songId, mvId }, source, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setMv(data);
      setLoading(false);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : 'MV 暂时无法加载');
      setLoading(false);
    });
    return () => controller.abort();
  }, [songId, mvId, source, attempt]);
  const retry = () => { setError(''); setLoading(true); setAttempt(value => value + 1); };
  return { mv, error, loading, setError, retry };
}

function MvStatus({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  return (
    <div className={styles.state} role={error ? 'alert' : 'status'}>
      <span className={styles.stateIcon}>{loading ? <Spinner size={24} /> : <Film size={26} strokeWidth={1.3} />}</span>
      <strong>{loading ? '正在加载 MV' : '暂时无法播放'}</strong>
      <p>{loading ? '正在获取视频与清晰度' : error}</p>
      {!loading && <Button icon={<RefreshCw size={14} />} onClick={onRetry}>重新加载</Button>}
    </div>
  );
}

const RELATED_PAGE = 12;

/** The artist's other videos under an MV opened from a list. */
function ArtistVideos({ artistId, artist, source }: { artistId: string; artist?: string; source: CatalogSource }) {
  const load = useCallback((offset: number, signal: AbortSignal) => mvApi.artist(artistId, offset, RELATED_PAGE, signal, source), [artistId, source]);
  return (
    <>
      <StickyBar compactTitle={artist}>
        <div className={styles.commentsBar}>
          <span className={styles.commentsTitle}>{artist ? `${artist} 的更多 MV` : '歌手的更多 MV'}</span>
        </div>
      </StickyBar>
      <MvList listKey={`artist-mvs:${source}:${artistId}`} load={load} pageSize={RELATED_PAGE} artist={artist} emptyText="这位歌手暂时没有更多 MV" />
    </>
  );
}

/**
 * MV in the main sheet: video stage and header, then the song's comments under
 * a sticky sort bar (song MVs) or the artist's other videos (picked from a list).
 */
export function MvView({ songId, mvId, source = 'netease', title, artist, artistId, cover }: Props) {
  const player = usePlayer();
  const { navigate } = useNavigation();
  const { mv, error, loading, setError, retry } = useMusicVideo(songId, mvId, source);
  const [quality, setQuality] = useState('');
  const [sort, setSort] = useState<CommentSortLabel>('推荐');
  const [total, setTotal] = useState<number>();
  const selected = mv?.qualities.some(q => q.id === quality) ? quality : mv?.qualities[0]?.id ?? '';

  // Leaving the page ends the MV session; music resumes if it was playing before.
  const latest = useLatest(player);
  useEffect(() => () => latest.current.closeMv(), [latest]);

  const heading = mv?.title || title;
  const byline = mv?.artist || artist;
  const artistKey = artistId || mv?.artistId;
  const songMv = !mvId && songId ? songId : undefined;
  const isCurrent = Boolean(songMv) && player.track.songId === songMv && (player.track.source ?? 'netease') === source;
  const status = loading || error ? <MvStatus loading={loading} error={error} onRetry={retry} /> : null;

  return (
    <Page gap="sm">
      {mv
        ? <MvVideoPlayer mv={mv} quality={selected} onQuality={value => { setError(''); setQuality(value); }} onError={setError}>{status}</MvVideoPlayer>
        : <div className={playerStyles.placeholder}>{status}</div>}

      <header className={styles.hero}>
        <Cover seed={`${source}:${songMv ?? `mv:${mvId}`}`} src={cover || mv?.cover} size={64} radius={10} className={styles.cover} />
        <div className={styles.heroMeta}>
          <div className={styles.titleRow}>
            <h1>{heading ?? <SkeletonBlock className={styles.titleSkeleton} />}</h1>
            <span className={styles.badge}>MV</span>
          </div>
          <p className={styles.meta}>
            {byline && <span>{byline}</span>}
            <span>{SOURCE_NAMES[source]}</span>
            {mv && <span>{mv.qualities.map(q => q.label).join(' / ')}</span>}
          </p>
        </div>
        <div className={styles.actions}>
          {isCurrent && !player.playing && (
            <Button icon={<Music2 size={15} strokeWidth={1.6} />} onClick={player.togglePlay}>切回听歌</Button>
          )}
          {songMv ? (
            <Button variant="ghost" icon={<MessageCircleMore size={15} strokeWidth={1.5} />} onClick={() => navigate({ name: 'comments', id: songMv, source, title, artist, cover })}>
              评论页
            </Button>
          ) : artistKey && (
            <Button variant="ghost" icon={<UserRound size={15} strokeWidth={1.5} />} onClick={() => navigate({ name: 'artist', id: artistKey, source, title: byline })}>
              歌手主页
            </Button>
          )}
        </div>
      </header>

      {songMv ? (
        <>
          <StickyBar compactTitle={heading}>
            <div className={styles.commentsBar}>
              <span className={styles.commentsTitle}>
                歌曲评论{total ? <em>{total.toLocaleString('zh-CN')}</em> : null}
              </span>
              <Tabs items={commentSorts} value={sort} onChange={setSort} label="评论排序" />
            </div>
          </StickyBar>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={sort} {...fadeSwap}>
              <CommentList thread={{ kind: 'song', id: songMv, source }} sort={commentSortKey[sort]} onTotal={setTotal} />
            </motion.div>
          </AnimatePresence>
        </>
      ) : artistKey && MV_FEATURES[source].artist ? (
        <ArtistVideos artistId={artistKey} artist={byline} source={source} />
      ) : null}
    </Page>
  );
}
