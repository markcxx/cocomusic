import type { NextRequest } from 'next/server';
import { cached, catalog, CatalogError, intParam, respond } from '@/server/music';

export const dynamic = 'force-dynamic';

/** GET /api/music/playlist?id=3778678&offset=0&limit=50 — playlist (or chart) header and a page of tracks. */
export function GET(request: NextRequest) {
  return respond(async () => {
    const params = request.nextUrl.searchParams;
    const provider = catalog(params.get('source'));
    const id = params.get('id') ?? '';
    if (!/^\d{1,20}$/.test(id)) throw new CatalogError('歌单 ID 格式不正确', 400);
    const offset = intParam(params.get('offset'), 0, 0, 100000);
    const limit = intParam(params.get('limit'), 50, 1, 200);
    return cached(`${provider.source}:playlist:${id}:${offset}:${limit}`, () => provider.playlistDetail(id, offset, limit));
  });
}
