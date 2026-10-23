import type { NextRequest } from 'next/server';
import { cached, catalog, CatalogError, intParam, respond } from '@/server/music';

export const dynamic = 'force-dynamic';

/** GET /api/music/playlists?category=华语&order=hot|quality&cursor=&limit=24 */
export function GET(request: NextRequest) {
  return respond(async () => {
    const params = request.nextUrl.searchParams;
    const provider = catalog(params.get('source'));
    const category = (params.get('category') ?? '').trim();
    if (category.length > 20) throw new CatalogError('分类名称过长', 400);
    const order = params.get('order') === 'quality' ? 'quality' : 'hot';
    const cursor = params.get('cursor') ?? '';
    if (cursor && !/^\d{1,16}$/.test(cursor)) throw new CatalogError('分页参数无效', 400);
    const limit = intParam(params.get('limit'), 24, 1, 60);
    return cached(`${provider.source}:playlists:${category}:${order}:${cursor}:${limit}`, () => provider.playlists({ category, order, cursor, limit }));
  });
}
