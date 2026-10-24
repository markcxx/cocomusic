import type { NextRequest } from 'next/server';
import { account, CatalogError, invalidate, readJson, respond } from '@/server/music';
import { isSource, validId } from '@/server/music/ids';

export const dynamic = 'force-dynamic';

/** POST /api/account/playlists/tracks { playlistId, trackIds, op: 'add' | 'del' } */
export function POST(request: NextRequest) {
  return respond(async () => {
    const source = request.nextUrl.searchParams.get('source');
    const body = await readJson<{ playlistId?: unknown; trackIds?: unknown; op?: unknown }>(request);
    const playlistId = String(body.playlistId ?? '');
    const trackIds = Array.isArray(body.trackIds) ? body.trackIds.map(String) : [];
    const platform = isSource(source) ? source : 'netease';
    if (!validId(platform, 'playlist', playlistId) || !trackIds.length || trackIds.length > 500 || !trackIds.every(id => validId(platform, 'song', id))) throw new CatalogError('参数无效', 400);
    if (body.op !== 'add' && body.op !== 'del') throw new CatalogError('参数无效', 400);
    await account(source).editPlaylistTracks(playlistId, trackIds, body.op);
    invalidate(`${source || 'netease'}:playlist:${playlistId}:`);
    return { ok: true };
  });
}
