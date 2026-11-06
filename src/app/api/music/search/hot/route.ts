import type { NextRequest } from 'next/server';
import { cached, catalog, respond } from '@/server/music';

export const dynamic = 'force-dynamic';

/**
 * GET /api/music/search/hot — hot-search ranking and default placeholder keyword.
 * Platforms without a default-keyword endpoint (QQ, Kugou) fall back to the top hot search.
 */
export function GET(request: NextRequest) {
  return respond(async () => {
    const provider = catalog(request.nextUrl.searchParams.get('source'));
    return cached(`${provider.source}:search-hot`, async () => {
      const discovery = await provider.searchDiscovery();
      return { ...discovery, placeholder: discovery.placeholder ?? discovery.hot[0]?.keyword };
    }, 10 * 60_000);
  });
}
