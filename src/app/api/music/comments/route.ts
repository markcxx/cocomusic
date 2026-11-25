import type { NextRequest } from 'next/server';
import { cached, catalog, CatalogError, intParam, invalidate, readJson, respond } from '@/server/music';
import { COMMENT_FEATURES } from '@/server/music/comment-features';
import { validId } from '@/server/music/ids';
import { session } from '@/server/music/session';
import type { CatalogProvider, CommentSort, CommentTarget } from '@/server/music/types';

export const dynamic = 'force-dynamic';

const sorts: CommentSort[] = ['recommend', 'hot', 'latest'];
const targets: CommentTarget[] = ['song', 'playlist', 'album'];
/** NetEase ids are numeric, QQ's look like "1!TxSk…C-dPE*", Kugou's numeric. */
const COMMENT_ID = /^[0-9A-Za-z!*._-]{1,200}$/;
const FLOOR_ID = /^[0-9A-Za-z_]{1,80}$/;

function thread(provider: CatalogProvider, kind: unknown, id: unknown) {
  const target = (kind ?? 'song') as CommentTarget;
  if (!targets.includes(target)) throw new CatalogError('未知的评论对象', 400);
  if (target !== 'song' && !COMMENT_FEATURES[provider.source].collections) throw new CatalogError('该平台暂不支持查看此类评论', 400);
  const key = String(id ?? '');
  if (!validId(provider.source, target, key)) throw new CatalogError('评论对象 ID 格式不正确', 400);
  return { target, id: key, prefix: `${provider.source}:comments:${target}:${key}:` };
}

function commentId(value: unknown) {
  const id = String(value ?? '');
  if (!COMMENT_ID.test(id)) throw new CatalogError('评论 ID 格式不正确', 400);
  return id;
}

/**
 * GET /api/music/comments?source=&kind=song|playlist|album&id=
 * - thread: &sort=recommend|hot|latest&cursor=&limit=
 * - replies under one comment (楼层): &parent=<commentId>&floor=&cursor=&limit=
 * Cached briefly per signed-in user: `liked` / `mine` depend on who asks.
 */
export function GET(request: NextRequest) {
  return respond(async () => {
    const params = request.nextUrl.searchParams;
    const provider = catalog(params.get('source'));
    const { target, id, prefix } = thread(provider, params.get('kind'), params.get('id'));
    const cursor = params.get('cursor') ?? undefined;
    if (cursor && cursor.length > 64) throw new CatalogError('分页参数无效', 400);
    const limit = intParam(params.get('limit'), 20, 1, 50);
    const viewer = session.get(provider.source)?.profile?.id ?? '';
    const parent = params.get('parent');
    if (parent !== null) {
      if (!provider.commentReplies || !COMMENT_FEATURES[provider.source].replies) throw new CatalogError('该平台暂不支持查看评论回复', 400);
      const floor = params.get('floor') || undefined;
      if (floor && !FLOOR_ID.test(floor)) throw new CatalogError('评论参数无效', 400);
      const root = commentId(parent);
      return cached(`${prefix}replies:${root}:${cursor ?? ''}:${limit}:${viewer}`, () => provider.commentReplies!(target, id, root, floor, cursor, limit), 60_000);
    }
    const sort = (params.get('sort') ?? 'recommend') as CommentSort;
    if (!sorts.includes(sort)) throw new CatalogError('未知的评论排序', 400);
    return cached(`${prefix}${sort}:${cursor ?? ''}:${limit}:${viewer}`, () => provider.comments(id, sort, cursor, limit, target), 60_000);
  });
}

type Body = { kind?: unknown; id?: unknown; action?: unknown; content?: unknown; commentId?: unknown; like?: unknown };

/**
 * POST /api/music/comments?source= { kind, id, action, … }
 * - post { content, commentId? } — new comment, or a reply to `commentId`
 * - delete { commentId } — one of the user's own comments
 * - like { commentId, like }
 */
export function POST(request: NextRequest) {
  return respond(async () => {
    const provider = catalog(request.nextUrl.searchParams.get('source'));
    const features = COMMENT_FEATURES[provider.source];
    const actions = provider.commentActions;
    const body = await readJson<Body>(request);
    const { target, id, prefix } = thread(provider, body.kind, body.id);
    const done = () => {
      invalidate(prefix);
      if (target === 'song') invalidate(`${provider.source}:song:${id}:`);
    };
    switch (body.action) {
      case 'post': {
        if (!actions || !features.post) throw new CatalogError('该平台暂不支持发表评论', 400);
        const content = typeof body.content === 'string' ? body.content.trim() : '';
        if (!content) throw new CatalogError('评论内容不能为空', 400);
        if ([...content].length > features.maxLength) throw new CatalogError(`评论最多 ${features.maxLength} 个字`, 400);
        const replyTo = body.commentId === undefined || body.commentId === null ? undefined : commentId(body.commentId);
        const comment = await actions.post(target, id, content, replyTo);
        done();
        return { comment: comment ?? null };
      }
      case 'delete': {
        if (!actions || !features.post) throw new CatalogError('该平台暂不支持删除评论', 400);
        await actions.remove(target, id, commentId(body.commentId));
        done();
        return { ok: true };
      }
      case 'like': {
        if (!actions?.like || !features.like) throw new CatalogError('该平台暂不支持评论点赞', 400);
        if (typeof body.like !== 'boolean') throw new CatalogError('参数无效', 400);
        await actions.like(target, id, commentId(body.commentId), body.like);
        invalidate(prefix);
        return { ok: true };
      }
      default: throw new CatalogError('未知的评论操作', 400);
    }
  });
}
