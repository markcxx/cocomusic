import type { NextRequest } from 'next/server';
import { account, CatalogError, readJson, respond } from '@/server/music';

export const dynamic = 'force-dynamic';

/** POST /api/account/playlists/subscription { id, subscribe } — 收藏 / 取消收藏 a playlist. */
export function POST(request: NextRequest) {
  return respond(async () => {
    const body = await readJson<{ id?: unknown; subscribe?: unknown }>(request);
    const id = String(body.id ?? '');
    if (!/^\d{1,20}$/.test(id) || typeof body.subscribe !== 'boolean') throw new CatalogError('参数无效', 400);
    await account(request.nextUrl.searchParams.get('source')).subscribePlaylist(id, body.subscribe);
    return { ok: true };
  });
}
