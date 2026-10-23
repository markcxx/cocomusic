'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { MapPin, Play, ThumbsUp } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { ErrorState, SkeletonBlock } from '@/components/common/AsyncState';
import { Cover } from '@/components/common/Cover';
import { fadeSwap } from '@/components/common/motion';
import { Tabs } from '@/components/common/Tabs';
import { usePlayer } from '@/components/player/player-store';
import { Page, StickyBar } from '@/components/scroll';
import { Button, ListFooter } from '@/components/ui';
import { catalogApi, formatCount, type CommentSort, type SongComment } from '@/lib/catalog-client';
import { useInfiniteList, useReachEnd } from '@/lib/hooks';
import styles from './CommentsView.module.css';

export const commentSorts = ['推荐', '最热', '最新'] as const;
export type CommentSortLabel = (typeof commentSorts)[number];
export const commentSortKey: Record<CommentSortLabel, CommentSort> = { 推荐: 'recommend', 最热: 'hot', 最新: 'latest' };
const sorts = commentSorts;
type SortLabel = CommentSortLabel;
const sortKey = commentSortKey;

const dateFormat = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormat = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' });

/** 刚刚 / n分钟前 / 今天 hh:mm / yyyy/mm/dd */
function when(ms: number) {
  const diff = Date.now() - ms;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (new Date(ms).toDateString() === new Date().toDateString()) return `今天 ${timeFormat.format(ms)}`;
  return dateFormat.format(ms);
}

function CommentItem({ comment }: { comment: SongComment }) {
  return (
    <motion.li className={styles.item} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}>
      <Cover seed={`user:${comment.user.id}`} src={comment.user.avatar} size={38} radius={999} className={styles.avatar} />
      <div className={styles.body}>
        <div className={styles.author}>
          <span className={styles.nickname}>{comment.user.nickname}</span>
          {comment.user.vip && <span className={styles.vip}>VIP</span>}
        </div>
        <p className={styles.content}>{comment.content}</p>
        {comment.replyTo && (
          <blockquote className={styles.reply}>
            <span className={styles.replyName}>@{comment.replyTo.nickname}：</span>{comment.replyTo.content}
          </blockquote>
        )}
        <div className={styles.meta}>
          <time dateTime={new Date(comment.time).toISOString()}>{when(comment.time)}</time>
          {comment.location && <span className={styles.location}><MapPin size={11} strokeWidth={1.6} />{comment.location}</span>}
          {comment.replyCount ? <span>{comment.replyCount} 条回复</span> : null}
          <span className={styles.likes} aria-label={`${comment.likedCount} 人赞同`}>
            <ThumbsUp size={13} strokeWidth={1.6} />{comment.likedCount ? formatCount(comment.likedCount) : ''}
          </span>
        </div>
      </div>
    </motion.li>
  );
}

/** Infinite comment list; needs an enclosing ScrollArea (main sheet or lyrics page). */
export function CommentList({ songId, sort, onTotal }: { songId: string; sort: CommentSort; onTotal: (total: number) => void }) {
  // The list hook pages by offset; map each offset to the cursor upstream gave us for it.
  const cursors = useRef(new Map<number, string | undefined>([[0, undefined]]));
  const loadPage = useCallback(async (offset: number, signal: AbortSignal) => {
    if (offset === 0) cursors.current = new Map([[0, undefined]]);
    const page = await catalogApi.comments(songId, sort, cursors.current.get(offset), signal);
    cursors.current.set(offset + page.items.length, page.cursor);
    onTotal(page.total);
    return { items: page.items, total: page.total, hasMore: page.hasMore && Boolean(page.cursor) };
  }, [songId, sort, onTotal]);
  const list = useInfiniteList<SongComment>(`comments:${songId}:${sort}`, loadPage);
  const sentinel = useReachEnd(list.loadMore, [list.items.length, list.hasMore]);

  if (list.error && !list.items.length) return <ErrorState message={list.error} onRetry={list.retry} />;
  if (list.loading) {
    return (
      <ul className={styles.list} aria-busy>
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index} className={styles.item}>
            <SkeletonBlock className={styles.avatarSkeleton} />
            <div className={styles.body}><SkeletonBlock className={styles.lineSkeleton} /><SkeletonBlock className={styles.lineSkeletonWide} /></div>
          </li>
        ))}
      </ul>
    );
  }
  if (!list.items.length) return <p className={styles.empty}>还没有评论，快来抢沙发</p>;
  return (
    <>
      <ul className={styles.list}>
        {list.items.map(comment => <CommentItem key={comment.id} comment={comment} />)}
      </ul>
      <div ref={sentinel}>
        <ListFooter loading={list.loadingMore} loadingText="正在加载更多评论" done={!list.hasMore} doneText="没有更多评论了" />
      </div>
    </>
  );
}

/** Song comments in the main sheet: song header, sort tabs, infinite list. */
export function CommentsView({ songId, title, artist, cover }: { songId: string; title?: string; artist?: string; cover?: string }) {
  const player = usePlayer();
  const [sort, setSort] = useState<SortLabel>('推荐');
  const [total, setTotal] = useState<number>();
  const isCurrent = player.track.songId === songId;

  return (
    <Page gap="sm">
      <header className={styles.hero}>
        <Cover seed={`netease:${songId}`} src={cover} size={96} radius={12} className={styles.cover} />
        <div className={styles.heroMeta}>
          <span className={styles.eyebrow}>歌曲评论</span>
          <h1>{title ?? <SkeletonBlock className={styles.titleSkeleton} />}</h1>
          {artist && <p className={styles.artist}>{artist}</p>}
          <p className={styles.total}>{total === undefined ? '正在加载评论' : `共 ${total.toLocaleString('zh-CN')} 条评论`}</p>
        </div>
        {isCurrent && !player.playing && (
          <Button variant="primary" icon={<Play size={15} strokeWidth={0} fill="currentColor" />} onClick={player.togglePlay} className={styles.play}>继续播放</Button>
        )}
      </header>
      <StickyBar compactTitle={title}>
        <Tabs items={sorts} value={sort} onChange={setSort} label="评论排序" />
      </StickyBar>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={sort} {...fadeSwap}>
          <CommentList songId={songId} sort={sortKey[sort]} onTotal={setTotal} />
        </motion.div>
      </AnimatePresence>
    </Page>
  );
}
