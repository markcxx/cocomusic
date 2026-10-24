import type { NextRequest } from 'next/server';
import { account, CatalogError, invalidate, readJson, respond } from '@/server/music';
import { isSource, validId } from '@/server/music/ids';

export const dynamic = 'force-dynamic';

/** GET /api/account/likes — ids of the user's liked songs. */
export function GET(request: NextRequest) {
  return respond(async () => ({ ids: await account(request.nextUrl.searchParams.get('source')).likedIds() }));
}

/** POST /api/account/likes { id, like } — like or unlike a song. */
export function POST(request: NextRequest) {
  return respond(async () => {
    const source = request.nextUrl.searchParams.get('source');
    const body = await readJson<{ id?: unknown; like?: unknown }>(request);
    const id = String(body.id ?? '');
    if (!validId(isSource(source) ? source : 'netease', 'song', id) || typeof body.like !== 'boolean') throw new CatalogError('参数无效', 400);
    await account(source).likeSong(id, body.like);
    // 我喜欢的音乐 is a playlist too; its cached pages are now stale.
    invalidate(`${source || 'netease'}:playlist:`);
    return { ok: true };
  });
}
