import type { NextRequest } from 'next/server';
import { cached, catalog, CatalogError, respond } from '@/server/music';

export const dynamic = 'force-dynamic';

/** GET /api/music/album?id=405188850 */
export function GET(request: NextRequest) {
  return respond(async () => {
    const params = request.nextUrl.searchParams;
    const provider = catalog(params.get('source'));
    const id = params.get('id') ?? '';
    if (!/^\d{1,20}$/.test(id)) throw new CatalogError('专辑 ID 格式不正确', 400);
    return cached(`${provider.source}:album:${id}`, () => provider.albumDetail(id), 30 * 60_000);
  });
}
