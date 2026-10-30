'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Film, MessageCircleMore, Music2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CommentList, commentSortKey, commentSorts, type CommentSortLabel } from '@/components/comments/CommentsView';
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
import type { CatalogSource } from '@/lib/catalog-client';
import { useLatest } from '@/lib/use-latest';
import { SOURCE_NAMES } from '@/server/music/ids';
import type { MusicVideo } from '@/server/music/mv';
import styles from './MvView.module.css';

type Props = { songId: string; source?: CatalogSource; title?: string; artist?: string; cover?: string };

/** Loads the song's official MV; `attempt` re-runs the request. */
function useMusicVideo(songId: string, source: CatalogSource) {
  const [mv, setMv] = useState<MusicVideo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/music/mv?${new URLSearchParams({ id: songId, source })}`, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'MV 暂时无法加载');
      if (controller.signal.aborted) return;
      setMv(data as MusicVideo);
      setLoading(false);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : 'MV 暂时无法加载');
      setLoading(false);
    });
    return () => controller.abort();
  }, [songId, source, attempt]);
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

/**
 * Song MV in the main sheet, laid out like the comments page: video stage,
 * song header, then the song's comments under a sticky sort bar.
 */
export function MvView({ songId, source = 'netease', title, artist, cover }: Props) {
  const player = usePlayer();
  const { navigate } = useNavigation();
  const { mv, error, loading, setError, retry } = useMusicVideo(songId, source);
  const [quality, setQuality] = useState('');
  const [sort, setSort] = useState<CommentSortLabel>('推荐');
  const [total, setTotal] = useState<number>();
  const selected = mv?.qualities.some(q => q.id === quality) ? quality : mv?.qualities[0]?.id ?? '';

  // Leaving the page ends the MV session; music resumes if it was playing before.
  const latest = useLatest(player);
  useEffect(() => () => latest.current.closeMv(), [latest]);

  const heading = mv?.title || title;
  const isCurrent = player.track.songId === songId && (player.track.source ?? 'netease') === source;
  const status = loading || error ? <MvStatus loading={loading} error={error} onRetry={retry} /> : null;

  return (
    <Page gap="sm">
      {mv
        ? <MvVideoPlayer mv={mv} quality={selected} onQuality={value => { setError(''); setQuality(value); }} onError={setError}>{status}</MvVideoPlayer>
        : <div className={playerStyles.placeholder}>{status}</div>}

      <header className={styles.hero}>
        <Cover seed={`${source}:${songId}`} src={cover || mv?.cover} size={64} radius={10} className={styles.cover} />
        <div className={styles.heroMeta}>
          <div className={styles.titleRow}>
            <h1>{heading ?? <SkeletonBlock className={styles.titleSkeleton} />}</h1>
            <span className={styles.badge}>MV</span>
          </div>
          <p className={styles.meta}>
            {(mv?.artist || artist) && <span>{mv?.artist || artist}</span>}
            <span>{SOURCE_NAMES[source]}</span>
            {mv && <span>{mv.qualities.map(q => q.label).join(' / ')}</span>}
          </p>
        </div>
        <div className={styles.actions}>
          {isCurrent && !player.playing && (
            <Button icon={<Music2 size={15} strokeWidth={1.6} />} onClick={player.togglePlay}>切回听歌</Button>
          )}
          <Button variant="ghost" icon={<MessageCircleMore size={15} strokeWidth={1.5} />} onClick={() => navigate({ name: 'comments', songId, source, title, artist, cover })}>
            评论页
          </Button>
        </div>
      </header>

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
          <CommentList songId={songId} source={source} sort={commentSortKey[sort]} onTotal={setTotal} />
        </motion.div>
      </AnimatePresence>
    </Page>
  );
}
