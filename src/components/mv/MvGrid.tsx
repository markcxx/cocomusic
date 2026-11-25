'use client';

import { motion } from 'framer-motion';
import { Play, PlayCircle } from 'lucide-react';
import { ErrorState, SkeletonBlock } from '@/components/common/AsyncState';
import { Cover } from '@/components/common/Cover';
import { riseItem, staggerList } from '@/components/common/motion';
import { useNavigation } from '@/components/layout/navigation';
import { formatTime } from '@/components/player/player-store';
import { ListFooter } from '@/components/ui';
import { formatCount, type MvPage, type MvSummary } from '@/lib/catalog-client';
import { cn } from '@/lib/cn';
import { useInfiniteList, useReachEnd } from '@/lib/hooks';
import styles from './MvGrid.module.css';

const year = (ms?: number) => (ms ? new Date(ms).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '');

/** 16:9 video card; opens the MV page. `artist` fills in when the list itself omits it (an artist's own videos). */
export function MvCard({ mv, artist, showRank }: { mv: MvSummary; artist?: string; showRank?: boolean }) {
  const { navigate } = useNavigation();
  const by = mv.artist || artist || '';
  const open = () => navigate({ name: 'mv', mvId: mv.id, source: mv.source, title: mv.title, artist: by, artistId: mv.artistId, cover: mv.cover });
  return (
    <motion.div className={styles.card} variants={riseItem}>
      <button type="button" className={styles.frame} onClick={open} aria-label={`播放 MV：${mv.title}`}>
        <Cover seed={`${mv.source}:mv:${mv.id}`} src={mv.cover} className={styles.cover} radius={0} />
        <span className={styles.scrim} aria-hidden />
        {showRank && mv.rank ? <span className={cn(styles.rank, mv.rank <= 3 && styles.rankTop)}>{mv.rank}</span> : null}
        {mv.playCount ? <span className={styles.plays}><PlayCircle size={12} strokeWidth={1.6} />{formatCount(mv.playCount)}</span> : null}
        {mv.duration ? <span className={styles.duration}>{formatTime(mv.duration / 1000)}</span> : null}
        <span className={styles.play} aria-hidden><Play size={20} strokeWidth={0} fill="currentColor" /></span>
      </button>
      <button type="button" className={styles.title} onClick={open} tabIndex={-1} data-tooltip={mv.title} data-tooltip-overflow>{mv.title}</button>
      <span className={styles.meta}>{[by, year(mv.publishTime)].filter(Boolean).join(' · ')}</span>
    </motion.div>
  );
}

export function MvGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className={styles.grid} aria-busy>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={styles.card}>
          <SkeletonBlock className={styles.coverSkeleton} />
          <SkeletonBlock className={styles.lineSkeleton} />
          <SkeletonBlock className={styles.lineSkeletonShort} />
        </div>
      ))}
    </div>
  );
}

/** Grid of MvCard with staggered entrance; skeleton cards while loading. */
export function MvCardGrid({ items, loading, artist, ranked }: { items: MvSummary[]; loading?: boolean; artist?: string; ranked?: boolean }) {
  if (loading) return <MvGridSkeleton />;
  return (
    <motion.div className={styles.grid} variants={staggerList} initial="hidden" animate="show">
      {items.map(mv => <MvCard key={mv.id} mv={mv} artist={artist} showRank={ranked} />)}
    </motion.div>
  );
}

/**
 * Infinite MV grid. `listKey` identifies the list (a new key reloads it); `load`
 * fetches one page. Needs an enclosing ScrollArea, like the other infinite lists.
 */
export function MvList({ listKey, load, pageSize, emptyText, artist, ranked }: {
  listKey: string;
  load: (offset: number, signal: AbortSignal) => Promise<MvPage>;
  pageSize: number;
  emptyText: string;
  artist?: string;
  ranked?: boolean;
}) {
  const list = useInfiniteList<MvSummary>(listKey, load);
  const sentinel = useReachEnd(list.loadMore, [list.items.length, list.hasMore]);
  if (list.error && !list.items.length) return <ErrorState message={list.error} onRetry={list.retry} />;
  if (list.loading) return <MvGridSkeleton count={Math.min(pageSize, 12)} />;  if (!list.items.length) return <p className={styles.empty}>{emptyText}</p>;
  return (
    <>
      <MvCardGrid items={list.items} artist={artist} ranked={ranked} />
      <div ref={sentinel}>
        <ListFooter error={list.error} onRetry={list.retry} loading={list.loadingMore} loadingText="正在加载更多 MV" done={!list.hasMore} doneText={`共 ${list.items.length} 个 MV`} />
      </div>
    </>
  );
}
