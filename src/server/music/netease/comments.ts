import { session } from '../session';
import type { CommentActions, CommentPage, CommentSort, CommentTarget, SongComment } from '../types';
import { NeteaseError, neteaseEapi, neteaseRequest } from './client';
import { image, num, record, rows, text, type Raw } from './mappers';

const THREAD_PREFIX: Record<CommentTarget, string> = { song: 'R_SO_4_', playlist: 'A_PL_0_', album: 'R_AL_3_' };
const threadId = (target: CommentTarget, id: string) => `${THREAD_PREFIX[target]}${id}`;

const sortTypes: Record<CommentSort, number> = { recommend: 99, hot: 2, latest: 3 };

const selfId = () => session.get('netease')?.profile?.id;

function mapComment(item: Raw, self = selfId()): SongComment {
  const user = record(item.user);
  const replied = rows(item.beReplied)[0];
  const repliedUser = record(replied?.user);
  return {
    id: text(item.commentId),
    content: text(item.content),
    time: num(item.time) ?? 0,
    likedCount: num(item.likedCount) ?? 0,
    replyCount: num(item.replyCount ?? record(item.showFloorComment).replyCount) || undefined,
    location: text(record(item.ipLocation).location) || undefined,
    user: {
      id: text(user.userId),
      nickname: text(user.nickname) || '网易云用户',
      avatar: image(user.avatarUrl, 80),
      vip: Number(user.vipType) > 0,
    },
    replyTo: replied && text(replied.content) ? { nickname: text(repliedUser.nickname) || '网易云用户', content: text(replied.content) } : undefined,
    liked: item.liked === true,
    mine: Boolean(self) && text(user.userId) === self,
  };
}

/**
 * comment_new (v2 resource comments). Paging differs by sort:
 * recommend uses an offset cursor, hot `normalHot#offset`, latest the last comment's time.
 * Our opaque cursor is "pageNo:upstreamCursor". Sent with the login (when any) so
 * `liked` reflects the signed-in user.
 */
export async function comments(id: string, sort: CommentSort, cursor: string | undefined, limit: number, target: CommentTarget = 'song'): Promise<CommentPage> {
  const [pageText, upstream = ''] = (cursor ?? '').split(/:(.*)/s);
  const pageNo = Math.max(1, Number(pageText) || 1);
  const offset = (pageNo - 1) * limit;
  const sortType = sortTypes[sort];
  const upstreamCursor = sortType === 99 ? offset : sortType === 2 ? `normalHot#${offset}` : upstream || '0';
  const data = await neteaseEapi<Raw>('/api/v2/resource/comments', {
    threadId: threadId(target, id),
    pageNo,
    showInner: true,
    pageSize: limit,
    cursor: upstreamCursor,
    sortType,
  });
  const body = record(data.data);
  const self = selfId();
  const items = rows(body.comments).map(item => mapComment(item, self));
  const hasMore = Boolean(body.hasMore) && items.length > 0;
  return {
    items,
    total: num(body.totalCount) ?? items.length,
    hasMore,
    cursor: hasMore ? `${pageNo + 1}:${text(body.cursor)}` : undefined,
  };
}

/** comment_floor: replies under one comment, paged by the last reply's time. */
export async function commentReplies(target: CommentTarget, id: string, commentId: string, _floor: string | undefined, cursor: string | undefined, limit: number): Promise<CommentPage> {
  const data = await neteaseRequest<Raw>('/resource/comment/floor/get', {
    parentCommentId: commentId,
    threadId: threadId(target, id),
    time: Number(cursor) || -1,
    limit,
  });
  const body = record(data.data);
  const self = selfId();
  const items = rows(body.comments).map(item => {
    const comment = mapComment(item, self);
    // Every reply quotes the floor's root; only a reply to another reply is worth showing.
    const replied = rows(item.beReplied)[0];
    return text(replied?.beRepliedCommentId) === commentId ? { ...comment, replyTo: undefined } : comment;
  });
  const hasMore = Boolean(body.hasMore) && items.length > 0;
  return { items, total: num(body.totalCount) ?? items.length, hasMore, cursor: hasMore ? String(num(body.time) ?? '') : undefined };
}

function requireLogin() {
  if (!session.get('netease')?.cookie.MUSIC_U) throw new NeteaseError('请先登录网易云音乐账号', 401);
}

/** resource/comments/add|reply|delete and v1/comment/like|unlike (weapi, signed in). */
export const commentActions: CommentActions = {
  async post(target, id, content, replyTo) {
    requireLogin();
    const data = await neteaseRequest<Raw>(`/resource/comments/${replyTo ? 'reply' : 'add'}`, {
      threadId: threadId(target, id),
      content,
      ...(replyTo ? { commentId: replyTo } : {}),
    });
    const comment = record(data.comment);
    return text(comment.commentId) ? mapComment(comment) : undefined;
  },
  async remove(target, id, commentId) {
    requireLogin();
    await neteaseRequest('/resource/comments/delete', { threadId: threadId(target, id), commentId });
  },
  async like(target, id, commentId, like) {
    requireLogin();
    await neteaseRequest(`/v1/comment/${like ? 'like' : 'unlike'}`, { threadId: threadId(target, id), commentId });
  },
};
