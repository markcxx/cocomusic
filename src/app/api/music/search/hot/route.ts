import type { NextRequest } from 'next/server';
import { cached, catalog, respond } from '@/server/music';

export const dynamic = 'force-dynamic';

/** GET /api/music/search/hot — hot-search ranking and default placeholder keyword. */
export function GET(request: NextRequest) {
  return respond(async () => {
    const provider = catalog(request.nextUrl.searchParams.get('source'));
    return cached(`${provider.source}:search-hot`, () => provider.searchDiscovery(), 10 * 60_000);
  });
}
