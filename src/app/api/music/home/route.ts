import type { NextRequest } from 'next/server';
import { cached, catalog, CatalogError, respond } from '@/server/music';

export const dynamic = 'force-dynamic';

const sections = ['featured', 'new', 'artists'] as const;

/** GET /api/music/home?section=featured|new|artists&source=netease */
export function GET(request: NextRequest) {
  return respond(async () => {
    const params = request.nextUrl.searchParams;
    const provider = catalog(params.get('source'));
    const section = params.get('section') ?? 'featured';
    if (!sections.includes(section as (typeof sections)[number])) throw new CatalogError('未知的首页板块', 400);
    const key = `${provider.source}:home:${section}`;
    if (section === 'new') return cached(key, () => provider.newReleases());
    if (section === 'artists') return cached(key, async () => ({ artists: await provider.artists(12) }));
    return cached(key, () => provider.featured());
  });
}
