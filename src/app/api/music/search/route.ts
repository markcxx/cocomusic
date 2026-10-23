import type { NextRequest } from 'next/server';
import { cached, catalog, CatalogError, intParam, respond } from '@/server/music';
import type { SearchType } from '@/server/music/types';

export const dynamic = 'force-dynamic';

const types: SearchType[] = ['song', 'playlist', 'album', 'artist'];

/** GET /api/music/search?keyword=晴天&type=song|playlist|album|artist&offset=0&limit=30 */
export function GET(request: NextRequest) {
  return respond(async () => {
    const params = request.nextUrl.searchParams;
    const provider = catalog(params.get('source'));
    const keyword = (params.get('keyword') ?? '').trim();
    if (!keyword) throw new CatalogError('请输入搜索内容', 400);
    if (keyword.length > 100) throw new CatalogError('搜索内容过长', 400);
    const type = (params.get('type') ?? 'song') as SearchType;
    if (!types.includes(type)) throw new CatalogError('不支持的搜索类型', 400);
    const offset = intParam(params.get('offset'), 0, 0, 2000);
    const limit = intParam(params.get('limit'), 30, 1, 100);
    return cached(`${provider.source}:search:${type}:${keyword}:${offset}:${limit}`, () => provider.search(keyword, type, offset, limit), 2 * 60_000);
  });
}
