'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { CommentList, commentSortKey, commentSorts, type CommentSortLabel } from '@/components/comments/CommentsView';
import { fadeSwap } from '@/components/common/motion';
import { Tabs } from '@/components/common/Tabs';
import { ScrollArea } from '@/components/scroll';
import type { Track } from '@/types/music';
import styles from './CommentsPage.module.css';

/** Page 1: comment header (title + sort) fixed at the top, list scrolling beneath it. */
export function CommentsPage({ songId, source, total }: { songId: string; source?: Track['source']; total?: number }) {
  const [sort, setSort] = useState<CommentSortLabel>('推荐');
  const [loaded, setLoaded] = useState<number>();
  const count = loaded ?? total;
  return (
    <section className={styles.comments} aria-label="评论">
      <div className={styles.commentsHeader}>
        <h3>评论{count ? <small>{count.toLocaleString('zh-CN')}</small> : null}</h3>
        <Tabs items={commentSorts} value={sort} onChange={setSort} label="评论排序" size="sm" />
      </div>
      {/* Own scroller: the page snap only takes over once this reaches its top. */}
      <ScrollArea className={styles.commentsScroll} nativeWheel>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${songId}:${sort}`} className={styles.commentsBody} {...fadeSwap}>
            <CommentList songId={songId} source={source} sort={commentSortKey[sort]} onTotal={setLoaded} />
          </motion.div>
        </AnimatePresence>
      </ScrollArea>
    </section>
  );
}
