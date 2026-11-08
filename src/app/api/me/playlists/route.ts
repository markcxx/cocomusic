import type { NextRequest } from 'next/server';
import { CatalogError, readJson, respond } from '@/server/music';
import { database } from '@/server/db/database';
import { createPlaylist, deletePlaylist, getPlaylist, listPlaylists, renamePlaylist } from '@/server/user-data/playlists';
import { sanitizeOrigin, sanitizeTracks } from '@/server/user-data/tracks';
import { PLAYLIST_TRACK_LIMIT } from '@/server/user-data/types';

export const dynamic = 'force-dynamic';

/** A full playlist of tracks is far bigger than the default body cap. */
const MAX_BODY = 4 * 1024 * 1024;

const requireId = (value: unknown) => {
  if (typeof value !== 'string' || !value || value.length > 64) throw new CatalogError('歌单 ID 无效', 400);
  return value;
};
const optionalText = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);

/**
 * 本地歌单 (kept on this machine, no login).
 * GET            → { playlists } summaries; GET ?id= → { playlist } with its songs
 * POST   { name, description?, cover?, origin?, tracks? } → { playlist } (summary)
 * PATCH  { id, name } → { playlist } (summary)
 * DELETE ?id=
 */
export function GET(request: NextRequest) {
  return respond(async () => {
    const id = request.nextUrl.searchParams.get('id');
    return id ? { playlist: getPlaylist(database(), requireId(id)) } : { playlists: listPlaylists(database()) };
  });
}

export function POST(request: NextRequest) {
  return respond(async () => {
    const body = await readJson<Record<string, unknown>>(request, MAX_BODY);
    if (typeof body.name !== 'string') throw new CatalogError('请输入歌单名称', 400);
    const playlist = createPlaylist(database(), {
      name: body.name,
      description: optionalText(body.description, 2000),
      cover: optionalText(body.cover, 1000),
      origin: sanitizeOrigin(body.origin),
      tracks: sanitizeTracks(body.tracks, PLAYLIST_TRACK_LIMIT),
    });
    return { playlist };
  });
}

export function PATCH(request: NextRequest) {
  return respond(async () => {
    const body = await readJson<{ id?: unknown; name?: unknown }>(request);
    if (typeof body.name !== 'string') throw new CatalogError('请输入歌单名称', 400);
    return { playlist: renamePlaylist(database(), requireId(body.id), body.name) };
  });
}

export function DELETE(request: NextRequest) {
  return respond(async () => {
    deletePlaylist(database(), requireId(request.nextUrl.searchParams.get('id')));
    return { ok: true };
  });
}
