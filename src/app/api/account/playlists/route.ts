import type { NextRequest } from 'next/server';
import { account, CatalogError, invalidate, readJson, respond } from '@/server/music';

export const dynamic = 'force-dynamic';

/** GET /api/account/playlists — playlists the user created and subscribed to. */
export function GET(request: NextRequest) {
  return respond(async () => ({ playlists: await account(request.nextUrl.searchParams.get('source')).userPlaylists() }));
}

/** POST /api/account/playlists { name, privacy } — create a playlist. */
export function POST(request: NextRequest) {
  return respond(async () => {
    const body = await readJson<{ name?: unknown; privacy?: unknown }>(request);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 40) throw new CatalogError('歌单名称需为 1-40 个字符', 400);
    const privacy = body.privacy === 'private' ? 'private' : 'public';
    return { playlist: await account(request.nextUrl.searchParams.get('source')).createPlaylist(name, privacy) };
  });
}

/** PATCH /api/account/playlists { id, name } — rename one of the user's playlists. */
export function PATCH(request: NextRequest) {
  return respond(async () => {
    const source = request.nextUrl.searchParams.get('source');
    const body = await readJson<{ id?: unknown; name?: unknown }>(request);
    const id = String(body.id ?? '');
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!/^\d{1,20}$/.test(id)) throw new CatalogError('歌单 ID 格式不正确', 400);
    if (!name || name.length > 40) throw new CatalogError('歌单名称需为 1-40 个字符', 400);
    await account(source).renamePlaylist(id, name);
    invalidate(`${source || 'netease'}:playlist:${id}:`);
    return { ok: true };
  });
}

/** DELETE /api/account/playlists?id= — delete one of the user's playlists. */
export function DELETE(request: NextRequest) {
  return respond(async () => {
    const params = request.nextUrl.searchParams;
    const id = params.get('id') ?? '';
    if (!/^\d{1,20}$/.test(id)) throw new CatalogError('歌单 ID 格式不正确', 400);
    await account(params.get('source')).deletePlaylist(id);
    invalidate(`${params.get('source') || 'netease'}:playlist:${id}:`);
    return { ok: true };
  });
}
