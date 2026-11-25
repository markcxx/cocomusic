'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, MapPin, MessageCircle, ThumbsUp, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from '@/components/account/account-store';
import { ErrorState, SkeletonBlock } from '@/components/common/AsyncState';
import { Cover } from '@/components/common/Cover';
import { ConfirmDialog, ListFooter, Spinner, toast } from '@/components/ui';
import { commentsApi, formatCount, type CommentSort, type CommentThread, type SongComment } from '@/lib/catalog-client';
import { cn } from '@/lib/cn';
import { useInfiniteList, useReachEnd } from '@/lib/hooks';
import { useSettings } from '@/lib/settings';
import { COMMENT_FEATURES } from '@/server/music/comment-features';
import { SOURCE_NAMES } from '@/server/music/ids';
import styles from './CommentsView.module.css';

export const commentSorts = ['推荐', '最热', '最新'] as const;
export type CommentSortLabel = (typeof commentSorts)[number];
export const commentSortKey: Record<CommentSortLabel, CommentSort> = { 推荐: 'recommend', 最热: 'hot', 最新: 'latest' };

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

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/**
 * What the viewer may do in this thread. Writing goes through the account of
 * the platform selected in 设置 › 曲库, so threads of other platforms stay read-only.
 * `ensure` explains or opens the login when an action is not available yet.
 */
function useCommentAccess(thread: CommentThread) {
  const source = thread.source ?? 'netease';
  const features = COMMENT_FEATURES[source];
  const platform = useSettings().catalogSource;
  const { profile, openLogin } = useAccount();
  const native = source === platform;
  const ensure = () => {
    if (!native) { toast.info(`这是${SOURCE_NAMES[source]}的评论，切换到该平台并登录后可以互动`); return false; }
    if (!profile) { openLogin(); return false; }
    return true;
  };
  return { source, features, native, signedIn: native && Boolean(profile), ensure };
}

type Access = ReturnType<typeof useCommentAccess>;

/** Text box for a new comment or a reply. Resolves true when it was sent. */
function Composer({ access, placeholder, autoFocus, compact, onSubmit, onCancel }: {
  access: Access;
  placeholder: string;
  autoFocus?: boolean;
  compact?: boolean;
  onSubmit: (content: string) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const max = access.features.maxLength;
  const length = [...content.trim()].length;
  const over = length > max;
  const submit = async () => {
    if (busy || !length || over || !access.ensure()) return;
    setBusy(true);
    const sent = await onSubmit(content.trim());
    setBusy(false);
    if (sent) setContent('');
  };

  if (!access.signedIn) {
    return (
      <button type="button" className={cn(styles.composerPrompt, compact && styles.composerCompact)} onClick={() => access.ensure()}>
        {access.native ? '登录后参与评论' : `切换到${SOURCE_NAMES[access.source]}并登录后参与评论`}
      </button>
    );
  }
  return (
    <div className={cn(styles.composer, compact && styles.composerCompact)}>
      <textarea
        className={styles.composerInput}
        value={content}
        placeholder={placeholder}
        rows={compact ? 2 : 3}
        autoFocus={autoFocus}
        disabled={busy}
        onChange={event => setContent(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void submit(); }
          if (event.key === 'Escape' && onCancel) { event.stopPropagation(); onCancel(); }
        }}
      />
      <div className={styles.composerBar}>
        <span className={cn(styles.composerCount, over && styles.composerOver)}>{length}/{max}</span>
        {onCancel && <button type="button" className={styles.composerCancel} onClick={onCancel} disabled={busy}>取消</button>}
        <button type="button" className={styles.composerSend} onClick={() => void submit()} disabled={busy || !length || over}>
          {busy && <Spinner size={12} />}
          {compact ? '回复' : '发表'}
        </button>
      </div>
    </div>
  );
}

function CommentItem({ comment, thread, access, nested, onChange, onRemoved, onReplied }: {
  comment: SongComment;
  thread: CommentThread;
  access: Access;
  /** Shown inside another comment's replies: no floor of its own. */
  nested?: boolean;
  onChange: (patch: Partial<SongComment>) => void;
  onRemoved: () => void;
  /** A reply to this comment was posted (the posted comment when upstream returned it). */
  onReplied: (reply: SongComment | null) => void;
}) {
  const { features } = access;
  const [replying, setReplying] = useState(false);
  const [floorOpen, setFloorOpen] = useState(false);
  /** Bumped to reload an open floor after replying to its root. */
  const [floorRevision, setFloorRevision] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const liking = useRef(false);
  const replies = comment.replyCount ?? 0;

  const toggleLike = async () => {
    if (liking.current || !access.ensure()) return;
    liking.current = true;
    const like = !comment.liked;
    const likedCount = Math.max(0, comment.likedCount + (like ? 1 : -1));
    onChange({ liked: like, likedCount });
    try {
      await commentsApi.like(thread, comment.id, like);
    } catch (error) {
      onChange({ liked: !like, likedCount: comment.likedCount });
      toast.error(errorText(error, like ? '点赞失败' : '取消点赞失败'));
    } finally {
      liking.current = false;
    }
  };
  const reply = async (content: string) => {
    try {
      const { comment: posted } = await commentsApi.post(thread, content, comment.id);
      toast.success('回复成功');
      setReplying(false);
      onReplied(posted);
      if (!nested) {
        if (floorOpen) setFloorRevision(value => value + 1);
        else setFloorOpen(true);
      }
      return true;
    } catch (error) {
      toast.error(errorText(error, '回复失败'));
      return false;
    }
  };

  return (
    <motion.li className={cn(styles.item, nested && styles.nestedItem)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}>
      <Cover seed={`user:${comment.user.id}`} src={comment.user.avatar} size={nested ? 30 : 38} radius={999} className={styles.avatar} />
      <div className={styles.body}>
        <div className={styles.author}>
          <span className={styles.nickname}>{comment.user.nickname}</span>
          {comment.user.vip && <span className={styles.vip}>VIP</span>}
          {comment.mine && <span className={styles.mine}>我</span>}
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
          {!nested && replies > 0 && (
            features.replies
              ? (
                <button type="button" className={cn(styles.action, floorOpen && styles.actionActive)} onClick={() => setFloorOpen(open => !open)} aria-expanded={floorOpen}>
                  {replies} 条回复<ChevronDown size={12} strokeWidth={1.8} className={cn(styles.chevron, floorOpen && styles.chevronOpen)} />
                </button>
              )
              : <span>{replies} 条回复</span>
          )}
          <span className={styles.actions}>
            {features.post && comment.mine && (
              <button type="button" className={styles.action} onClick={() => setConfirming(true)} aria-label="删除评论">
                <Trash2 size={13} strokeWidth={1.6} />删除
              </button>
            )}
            {features.post && (
              <button type="button" className={cn(styles.action, replying && styles.actionActive)} onClick={() => { if (access.ensure()) setReplying(open => !open); }} aria-label="回复">
                <MessageCircle size={13} strokeWidth={1.6} />回复
              </button>
            )}
            {features.like ? (
              <button type="button" className={cn(styles.action, comment.liked && styles.liked)} onClick={() => void toggleLike()} aria-pressed={Boolean(comment.liked)} aria-label={`${comment.liked ? '取消点赞' : '点赞'}，${comment.likedCount} 人赞同`}>
                <ThumbsUp size={13} strokeWidth={1.6} fill={comment.liked ? 'currentColor' : 'none'} />{comment.likedCount ? formatCount(comment.likedCount) : ''}
              </button>
            ) : (
              <span className={cn(styles.likes, comment.liked && styles.liked)} aria-label={`${comment.likedCount} 人赞同`}>
                <ThumbsUp size={13} strokeWidth={1.6} fill={comment.liked ? 'currentColor' : 'none'} />{comment.likedCount ? formatCount(comment.likedCount) : ''}
              </span>
            )}
          </span>
        </div>
        <AnimatePresence initial={false}>
          {replying && (
            <motion.div key="reply" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className={styles.replyBox}>
              <Composer access={access} compact autoFocus placeholder={`回复 @${comment.user.nickname}`} onSubmit={reply} onCancel={() => setReplying(false)} />
            </motion.div>
          )}
        </AnimatePresence>
        {floorOpen && !nested && <Replies key={floorRevision} thread={thread} parent={comment} access={access} onCountChange={delta => onChange({ replyCount: Math.max(0, replies + delta) })} />}
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="删除评论"
        message="删除后无法恢复，确定删除这条评论吗？"
        confirmLabel="删除"
        tone="danger"
        onConfirm={async () => {
          await commentsApi.remove(thread, comment.id);
          toast.success('评论已删除');
          onRemoved();
        }}
      />
    </motion.li>
  );
}

/** Upstream pages can overlap; keep each comment once. */
function useCursorPager(load: (cursor: string | undefined, signal: AbortSignal) => Promise<{ items: SongComment[]; total: number; hasMore: boolean; cursor?: string }>) {
  const next = useRef<string | undefined>(undefined);
  const seen = useRef(new Set<string>());
  const loadPage = useCallback(async (offset: number, signal: AbortSignal) => {
    if (offset === 0) { next.current = undefined; seen.current = new Set(); }
    const page = await load(next.current, signal);
    next.current = page.cursor;
    const items = page.items.filter(item => !seen.current.has(item.id));
    for (const item of items) seen.current.add(item.id);
    return { items, total: page.total, hasMore: page.hasMore && Boolean(page.cursor) };
  }, [load]);
  return { loadPage, remember: (id: string) => seen.current.add(id) };
}

/** 楼层: replies under one comment, loaded on demand and paged with a button. */
function Replies({ thread, parent, access, onCountChange }: { thread: CommentThread; parent: SongComment; access: Access; onCountChange: (delta: number) => void }) {
  const load = useCallback((cursor: string | undefined, signal: AbortSignal) => commentsApi.replies(thread, parent, cursor, signal), [thread, parent]);
  const pager = useCursorPager(load);
  const list = useInfiniteList<SongComment>(`replies:${thread.source ?? ''}:${thread.kind}:${thread.id}:${parent.id}`, pager.loadPage);
  const added = (reply: SongComment | null) => {
    onCountChange(1);
    if (reply) { pager.remember(reply.id); list.prepend([reply]); } else list.retry();
  };

  if (list.loading) return <div className={styles.floorStatus}><Spinner size={14} />正在加载回复</div>;
  if (list.error && !list.items.length) return <div className={styles.floorStatus}>{list.error}<button type="button" className={styles.action} onClick={list.retry}>重试</button></div>;
  return (
    <div className={styles.floor}>
      <ul className={styles.list}>
        {list.items.map(item => (
          <CommentItem
            key={item.id}
            comment={item}
            thread={thread}
            access={access}
            nested
            onChange={patch => list.updateWhere(entry => entry.id === item.id, entry => ({ ...entry, ...patch }))}
            onRemoved={() => { list.removeWhere(entry => entry.id === item.id); onCountChange(-1); }}
            onReplied={added}
          />
        ))}
      </ul>
      {list.hasMore && (
        <button type="button" className={styles.floorMore} onClick={list.loadMore} disabled={list.loadingMore}>
          {list.loadingMore ? <><Spinner size={12} />正在加载</> : list.error ? '加载失败，点击重试' : '查看更多回复'}
        </button>
      )}
    </div>
  );
}

/** Infinite comment list with a composer on top; needs an enclosing ScrollArea (main sheet or lyrics page). */
export function CommentList({ thread, sort, onTotal }: { thread: CommentThread; sort: CommentSort; onTotal: (total: number) => void }) {
  const access = useCommentAccess(thread);
  const load = useCallback((cursor: string | undefined, signal: AbortSignal) => commentsApi.list(thread, sort, cursor, signal), [thread, sort]);
  const pager = useCursorPager(load);
  const list = useInfiniteList<SongComment>(`comments:${thread.source ?? ''}:${thread.kind}:${thread.id}:${sort}`, pager.loadPage);
  const sentinel = useReachEnd(list.loadMore, [list.items.length, list.hasMore]);
  const { loading, total } = list;
  useEffect(() => { if (!loading) onTotal(total); }, [loading, total, onTotal]);

  const post = async (content: string) => {
    try {
      const { comment } = await commentsApi.post(thread, content);
      toast.success('评论已发表');
      if (comment) { pager.remember(comment.id); list.prepend([comment]); } else list.retry();
      return true;
    } catch (error) {
      toast.error(errorText(error, '发表评论失败'));
      return false;
    }
  };
  const update = (id: string) => (patch: Partial<SongComment>) => list.updateWhere(item => item.id === id, item => ({ ...item, ...patch }));

  const composer = access.features.post && <Composer access={access} placeholder="写下你的想法…" onSubmit={post} />;
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
  if (!list.items.length) return <>{composer}<p className={styles.empty}>还没有评论，快来抢沙发</p></>;
  return (
    <>
      {composer}
      <ul className={styles.list}>
        {list.items.map(comment => (
          <CommentItem
            key={comment.id}
            comment={comment}
            thread={thread}
            access={access}
            onChange={update(comment.id)}
            onRemoved={() => list.removeWhere(item => item.id === comment.id)}
            onReplied={() => update(comment.id)({ replyCount: (comment.replyCount ?? 0) + 1 })}
          />
        ))}
      </ul>
      <div ref={sentinel}>
        <ListFooter loading={list.loadingMore} loadingText="正在加载更多评论" done={!list.hasMore} doneText="没有更多评论了" />
      </div>
    </>
  );
}
