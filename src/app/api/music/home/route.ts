import type { NextRequest } from 'next/server';
import { cached, catalog, CatalogError, respond } from '@/server/music';
import { dailySongs } from '@/server/music/netease/discovery';
import { session } from '@/server/music/session';

export const dynamic = 'force-dynamic';

const sections = ['featured', 'new', 'artists', 'daily-songs'] as const;

/** GET /api/music/home?section=featured|new|artists|daily-songs&source=netease&refresh=1 */
export function GET(request: NextRequest) {
  return respond(async () => {
    const params = request.nextUrl.searchParams;
    const provider = catalog(params.get('source'));
    const section = params.get('section') ?? 'featured';
    if (!sections.includes(section as (typeof sections)[number])) throw new CatalogError('未知的首页板块', 400);
    if (section === 'daily-songs') {
      if (provider.source !== 'netease') throw new CatalogError('每日推荐歌曲仅适用于网易云音乐', 400);
      return dailySongs();
    }
    const account = session.get(provider.source);
    const viewer = account ? `${account.profile?.id ?? ''}:${account.savedAt}` : 'guest';
    const day = provider.source === 'netease' && account && section === 'featured' ? new Date().toDateString() : '';
    const key = `${provider.source}:home:${section}:${viewer}:${day}`;
    if (section === 'new') return cached(key, () => provider.newReleases());
    if (section === 'artists') return cached(key, async () => ({ artists: await provider.artists(12) }));
    if (params.get('refresh') === '1') return provider.featured();
    return cached(key, () => provider.featured());
  });
}
