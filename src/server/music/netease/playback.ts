import { buildLyrics } from '../lrc';
import type { CommentPage, CommentSort, Lyrics, SongComment, SongSource, SongStats } from '../types';
import { NeteaseError, neteaseEapi } from './client';
import { image, num, record, rows, text, type Raw } from './mappers';

// Endpoints follow CloudMusicApi / multiPlatformMusicApi netease modules:
// song_url_v1, lyric_new, song_red_count, comment_new.

/** song_url_v1. Uses the stored login when present so VIP members get full tracks. */
export async function songSource(id: string): Promise<SongSource> {
  const data = await neteaseEapi<Raw>('/api/song/enhance/player/url/v1', { ids: `[${id}]`, level: 'exhigh', encodeType: 'flac' });
  const item = rows(data.data).find(row => text(row.id) === id) ?? rows(data.data)[0];
  const url = text(item?.url).replace(/^http:/, 'https:');
  if (!item || !url) {
    const code = num(item?.code);
    // 404: no copyright for this region/account; fee 1/4: VIP or paid album.
    throw new NeteaseError(code === 404 ? '该歌曲暂无版权，无法播放' : '暂时无法获取播放地址，可能需要登录或会员', 404);
  }
  const trialInfo = record(item.freeTrialInfo);
  const start = num(trialInfo.start);
  const end = num(trialInfo.end);
  return {
    id,
    url,
    bitrate: num(item.br),
    level: text(item.level) || undefined,
    trial: start !== undefined && end !== undefined && end > start ? { start, end } : undefined,
  };
}

/** lyric_new (v1): original + translation; the plain `lrc` field is sufficient for line sync. */
export async function lyrics(id: string): Promise<Lyrics> {
  const data = await neteaseEapi<Raw>('/api/song/lyric/v1', { id, cp: false, tv: 0, lv: 0, rv: 0, kv: 0, yv: 0, ytv: 0, yrv: 0 }, { auth: false });
  if (data.pureMusic === true || data.nolyric === true) return { lines: [], synced: false, instrumental: true };
  return buildLyrics(text(record(data.lrc).lyric), text(record(data.tlyric).lyric));
}

const sortTypes: Record<CommentSort, number> = { recommend: 99, hot: 2, latest: 3 };

function mapComment(item: Raw): SongComment {
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
  };
}

/**
 * comment_new (v2 resource comments). Paging differs by sort:
 * recommend uses an offset cursor, hot `normalHot#offset`, latest the last comment's time.
 * Our opaque cursor is "pageNo:upstreamCursor".
 */
export async function comments(id: string, sort: CommentSort, cursor: string | undefined, limit: number): Promise<CommentPage> {
  const [pageText, upstream = ''] = (cursor ?? '').split(/:(.*)/s);
  const pageNo = Math.max(1, Number(pageText) || 1);
  const offset = (pageNo - 1) * limit;
  const sortType = sortTypes[sort];
  const upstreamCursor = sortType === 99 ? offset : sortType === 2 ? `normalHot#${offset}` : upstream || '0';
  const data = await neteaseEapi<Raw>('/api/v2/resource/comments', {
    threadId: `R_SO_4_${id}`,
    pageNo,
    showInner: true,
    pageSize: limit,
    cursor: upstreamCursor,
    sortType,
  }, { auth: false });
  const body = record(data.data);
  const items = rows(body.comments).map(mapComment);
  const hasMore = Boolean(body.hasMore) && items.length > 0;
  return {
    items,
    total: num(body.totalCount) ?? items.length,
    hasMore,
    cursor: hasMore ? `${pageNo + 1}:${text(body.cursor)}` : undefined,
  };
}

/** song_red_count + comment total; either may fail independently. */
export async function songStats(id: string): Promise<SongStats> {
  const [likes, thread] = await Promise.allSettled([
    neteaseEapi<Raw>('/api/song/red/count', { songId: id }, { auth: false }),
    comments(id, 'latest', undefined, 1),
  ]);
  return {
    likeCount: likes.status === 'fulfilled' ? num(record(likes.value.data).count) : undefined,
    commentCount: thread.status === 'fulfilled' ? thread.value.total : undefined,
  };
}
