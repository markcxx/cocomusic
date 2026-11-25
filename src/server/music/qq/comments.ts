import type { CommentActions, CommentPage, CommentSort, CommentTarget, SongComment } from '../types';
import { qqEnsureLogin } from './auth';
import { auth, QQError, qqRequest } from './client';
import { https, num, record, rows, splitSongKey, text, type Raw } from './mappers';
import { trackInfo } from './playback';

/** music.globalComment BizType per thread kind. */
const BIZ_TYPES: Record<CommentTarget, number> = { song: 1, album: 2, playlist: 3 };

/** Albums are addressed by mid here; comment threads need the numeric album id. */
const albumIds = new Map<string, string>();
async function albumId(mid: string) {
  const known = albumIds.get(mid);
  if (known) return known;
  const data = await qqRequest<Raw>('music.musichallAlbum.AlbumInfoServer', 'GetAlbumDetail', { albumMid: mid });
  const id = text(record(data.basicInfo).albumID);
  if (!id || id === '0') throw new QQError('专辑不存在或已下架', 404);
  if (albumIds.size > 200) albumIds.delete(albumIds.keys().next().value!);
  albumIds.set(mid, id);
  return id;
}

async function bizId(target: CommentTarget, id: string) {
  if (target === 'playlist') return id;
  if (target === 'album') return albumId(id);
  const { mid, id: songId } = splitSongKey(id);
  return songId ?? text((await trackInfo(mid)).id);
}

const stripEmoji = (value: unknown) => text(value).replace(/\[em\]e\d+\[\/em\]/g, '');

function mapComment(item: Raw): SongComment {
  const replied = rows(item.RepliedComments)[0];
  return {
    id: text(item.CmId ?? item.SeqNo),
    content: stripEmoji(item.Content),
    time: (num(item.PubTime) ?? 0) * 1000,
    likedCount: num(item.PraiseNum) ?? 0,
    replyCount: num(item.ReplyCnt) || undefined,
    location: text(item.Location) || undefined,
    user: { id: text(item.EncryptUin), nickname: text(item.Nick) || 'QQ 音乐用户', avatar: https(item.Avatar), vip: Boolean(item.VipIcon) },
    replyTo: text(replied?.Content) ? { nickname: text(replied.Nick) || 'QQ 音乐用户', content: stripEmoji(replied.Content) } : undefined,
    liked: Number(item.IsPraised) === 1,
    mine: Number(item.IsSelf) === 1,
  };
}

/**
 * music.globalComment.CommentRead. 最热 uses GetHotCommentList; 推荐 and 最新
 * use GetNewCommentList, paged by the last comment's SeqNo.
 * Opaque cursor: "<pageNum>:<lastSeqNo>".
 */
export async function comments(key: string, sort: CommentSort, cursor: string | undefined, limit: number, target: CommentTarget = 'song'): Promise<CommentPage> {
  const biz = { BizType: BIZ_TYPES[target], BizId: await bizId(target, key) };
  const [pageText, lastSeq = ''] = (cursor ?? '').split(/:(.*)/s);
  const pageNum = Math.max(0, Number(pageText) || 0);
  const hot = sort === 'hot';
  const data = await qqRequest<Raw>('music.globalComment.CommentRead', hot ? 'GetHotCommentList' : 'GetNewCommentList', hot
    ? { ...biz, LastCommentSeqNo: lastSeq, PageSize: limit, PageNum: pageNum, HotType: 1, WithAirborne: 0, PicEnable: 1 }
    : { ...biz, LastCommentSeqNo: lastSeq, PageSize: limit, PageNum: pageNum, FromCommentId: '', WithHot: 0, PicEnable: 1 });
  const list = record(data.CommentList);
  const raw = rows(list.Comments);
  const items = raw.map(mapComment);
  const hasMore = Boolean(Number(list.HasMore)) && items.length > 0;
  return {
    items,
    total: num(list.Total) ?? items.length,
    hasMore,
    cursor: hasMore ? `${pageNum + 1}:${text(raw[raw.length - 1]?.SeqNo)}` : undefined,
  };
}

/**
 * GetReplyCommentList under a root comment. Upstream `HasMore` can stay set on
 * the last page, so the total bounds it too. Cursor: "<pageNum>:<lastSeqNo>".
 */
export async function commentReplies(_target: CommentTarget, _id: string, commentId: string, _floor: string | undefined, cursor: string | undefined, limit: number): Promise<CommentPage> {
  const [pageText, lastSeq = ''] = (cursor ?? '').split(/:(.*)/s);
  const pageNum = Math.max(0, Number(pageText) || 0);
  const data = await qqRequest<Raw>('music.globalComment.CommentRead', 'GetReplyCommentList', {
    RootCmId: commentId, LastCommentSeqNo: lastSeq, PageSize: limit, LastRankScore: pageNum ? '0' : '', RankType: 1, PicEnable: 1, PageNum: pageNum,
  });
  const list = record(data.CommentList);
  const raw = rows(list.Comments);
  const items = raw.map(mapComment);
  const total = num(list.Total) ?? items.length;
  const hasMore = Boolean(Number(list.HasMore)) && items.length > 0 && (pageNum + 1) * limit < total;
  return { items, total, hasMore, cursor: hasMore ? `${pageNum + 1}:${text(raw[raw.length - 1]?.SeqNo)}` : undefined };
}

/** CommentWriteServer call; an expired music key is renewed once and the call retried. */
async function write(method: string, param: Raw) {
  if (!auth()) throw new QQError('请先登录 QQ 音乐账号', 401);
  const send = () => qqRequest<Raw>('music.globalComment.CommentWriteServer', method, param);
  let data: Raw;
  try {
    data = await send();
  } catch (error) {
    if (!(error instanceof QQError) || error.status !== 401 || (await qqEnsureLogin()) !== 'renewed') throw error;
    data = await send();
  }
  const sub = num(data.SubCode) ?? 0;
  if (sub !== 0) throw new QQError(text(data.Msg) || `QQ 音乐评论操作失败（${sub}）`, 400, sub);
  return data;
}

export const commentActions: CommentActions = {
  async post(target, id, content, replyTo) {
    const data = await write('AddComment', {
      Content: content, BizType: BIZ_TYPES[target], BizId: await bizId(target, id), ...(replyTo ? { RepliedCmId: replyTo } : {}),
    });
    const comment = record(data.Comment);
    return text(comment.CmId) ? { ...mapComment(comment), mine: true } : undefined;
  },
  async remove(_target, _id, commentId) {
    await write('DelComment', { CommentId: commentId });
  },
};
