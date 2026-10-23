import type { NextRequest } from 'next/server';
import { cached, catalog, CatalogError, respond } from '@/server/music';

export const dynamic = 'force-dynamic';

/** GET /api/music/search/suggest?keyword=周杰 — type-ahead completions and best matches. */
export function GET(request: NextRequest) {
  return respond(async () => {
    const params = request.nextUrl.searchParams;
    const provider = catalog(params.get('source'));
    const keyword = (params.get('keyword') ?? '').trim();
    if (!keyword) throw new CatalogError('请输入搜索内容', 400);
    if (keyword.length > 60) throw new CatalogError('搜索内容过长', 400);
    return cached(`${provider.source}:suggest:${keyword}`, () => provider.suggest(keyword), 10 * 60_000);
  });
}
