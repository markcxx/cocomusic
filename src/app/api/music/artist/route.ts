import type { NextRequest } from 'next/server';
import { cached, catalog, CatalogError, intParam, respond } from '@/server/music';
import { validId } from '@/server/music/ids';
import { mapBiography } from '@/server/music/artist-biography';

export const dynamic = 'force-dynamic';

/** GET /api/music/artist?id=6452&section=info|songs|albums&offset=&limit= */
export function GET(request: NextRequest) {
  return respond(async () => {
    const params = request.nextUrl.searchParams;
    const provider = catalog(params.get('source'));
    const id = params.get('id') ?? '';
    if (!validId(provider.source, 'artist', id)) throw new CatalogError('歌手 ID 格式不正确', 400);
    const section = params.get('section') ?? 'info';
    const offset = intParam(params.get('offset'), 0, 0, 5000);
    const limit = intParam(params.get('limit'), 50, 1, 100);
    const key = `${provider.source}:artist:${id}:${section}:${offset}:${limit}`;
    if (section === 'songs') return cached(key, () => provider.artistSongs(id, offset, limit), 30 * 60_000);
    if (section === 'albums') return cached(key, () => provider.artistAlbums(id, offset, limit), 30 * 60_000);
    if (section === 'info') return cached(key, () => provider.artistInfo(id), 30 * 60_000);
    if (section === 'biography') return cached(key, async () => provider.artistBiography ? provider.artistBiography(id) : mapBiography((await provider.artistInfo(id)).description, []), 30 * 60_000);
    throw new CatalogError('未知的歌手板块', 400);
  });
}
