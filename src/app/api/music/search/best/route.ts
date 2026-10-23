import type { NextRequest } from 'next/server';
import { cached, catalog, CatalogError, respond } from '@/server/music';

export const dynamic = 'force-dynamic';

/** GET /api/music/search/best?keyword=周杰伦 — best-matching artist/album/playlist. */
export function GET(request: NextRequest) {
  return respond(async () => {
    const params = request.nextUrl.searchParams;
    const provider = catalog(params.get('source'));
    const keyword = (params.get('keyword') ?? '').trim();
    if (!keyword) throw new CatalogError('请输入搜索内容', 400);
    if (keyword.length > 100) throw new CatalogError('搜索内容过长', 400);
    return cached(`${provider.source}:best:${keyword}`, () => provider.bestMatch(keyword), 10 * 60_000);
  });
}
