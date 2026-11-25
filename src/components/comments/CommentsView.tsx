'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SkeletonBlock } from '@/components/common/AsyncState';
import { Cover } from '@/components/common/Cover';
import { fadeSwap } from '@/components/common/motion';
import { Tabs } from '@/components/common/Tabs';
import { usePlayer } from '@/components/player/player-store';
import { Page, StickyBar } from '@/components/scroll';
import { Button } from '@/components/ui';
import type { CatalogSource, CommentTarget } from '@/lib/catalog-client';
import { CommentList, commentSortKey, commentSorts, type CommentSortLabel } from './CommentList';
import styles from './CommentsView.module.css';

const eyebrows: Record<CommentTarget, string> = { song: '歌曲评论', playlist: '歌单评论', album: '专辑评论' };

/** Comments of a song, playlist or album in the main sheet: header, sort tabs, infinite list. */
export function CommentsView({ id, kind = 'song', source, title, artist, cover }: { id: string; kind?: CommentTarget; source?: CatalogSource; title?: string; artist?: string; cover?: string }) {
  const player = usePlayer();
  const [sort, setSort] = useState<CommentSortLabel>('推荐');
  const [total, setTotal] = useState<number>();
  const thread = useMemo(() => ({ kind, id, source }), [kind, id, source]);
  const isCurrent = kind === 'song' && player.track.songId === id;

  return (
    <Page gap="sm">
      <header className={styles.hero}>
        <Cover seed={`${source ?? 'netease'}:${kind === 'song' ? '' : `${kind}:`}${id}`} src={cover} size={96} radius={12} className={styles.cover} />
        <div className={styles.heroMeta}>
          <span className={styles.eyebrow}>{eyebrows[kind]}</span>
          <h1>{title ?? <SkeletonBlock className={styles.titleSkeleton} />}</h1>
          {artist && <p className={styles.artist}>{artist}</p>}
          <p className={styles.total}>{total === undefined ? '正在加载评论' : `共 ${total.toLocaleString('zh-CN')} 条评论`}</p>
        </div>
        {isCurrent && !player.playing && (
          <Button variant="primary" icon={<Play size={15} strokeWidth={0} fill="currentColor" />} onClick={player.togglePlay} className={styles.play}>继续播放</Button>
        )}
      </header>
      <StickyBar compactTitle={title}>
        <Tabs items={commentSorts} value={sort} onChange={setSort} label="评论排序" />
      </StickyBar>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={sort} {...fadeSwap}>
          <CommentList thread={thread} sort={commentSortKey[sort]} onTotal={setTotal} />
        </motion.div>
      </AnimatePresence>
    </Page>
  );
}
