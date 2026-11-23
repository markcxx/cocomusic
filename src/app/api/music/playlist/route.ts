import type { NextRequest } from 'next/server';
import { cached, catalog, CatalogError, intParam, respond } from '@/server/music';
import { validId } from '@/server/music/ids';
import type { CatalogProvider } from '@/server/music/types';
import { session } from '@/server/music/session';

export const dynamic = 'force-dynamic';

/** Read aligned upstream pages so reversing a playlist includes its unloaded tail. */
async function fullPlaylist(provider: CatalogProvider, id: string) {
  const size = 200;
  const first = await provider.playlistDetail(id, 0, size);
  const tracks = [...first.tracks];
  let page = first;
  for (let offset = size; page.hasMore && offset < first.info.trackCount; offset += size) {
    page = await provider.playlistDetail(id, offset, size);
    tracks.push(...page.tracks);
  }
  return { ...first, tracks };
}

/** GET /api/music/playlist?id=3778678&offset=0&limit=50 — playlist (or chart) header and a page of tracks. */
export function GET(request: NextRequest) {
  return respond(async () => {
    const params = request.nextUrl.searchParams;
    const provider = catalog(params.get('source'));
    const id = params.get('id') ?? '';
    if (!validId(provider.source, 'playlist', id)) throw new CatalogError('歌单 ID 格式不正确', 400);
    const offset = intParam(params.get('offset'), 0, 0, 100000);
    const limit = intParam(params.get('limit'), 50, 1, 200);
    const loadOrdered = provider.playlistByCollectionTime;
    const byTime = loadOrdered && !/^\d+$/.test(id);
    const reverse = params.get('reverse') === '1';
    if (byTime || reverse) {
      const login = session.get(provider.source);
      const key = `${provider.source}:playlist:${id}:full:${login?.cookie.userid ?? 'guest'}:${login?.savedAt ?? 0}`;
      const detail = await cached(key, () => byTime ? loadOrdered(id) : fullPlaylist(provider, id));
      const total = detail.tracks.length;
      const end = offset + limit;
      const tracks = reverse
        ? detail.tracks.slice(Math.max(0, total - end), Math.max(0, total - offset)).reverse()
        : detail.tracks.slice(offset, end);
      return { ...detail, tracks, offset, hasMore: end < total };
    }
    return cached(`${provider.source}:playlist:${id}:${offset}:${limit}`, () => provider.playlistDetail(id, offset, limit));
  });
}
