import type { NextRequest } from 'next/server';
import { CatalogError, readJson, respond } from '@/server/music';
import { database } from '@/server/db/database';
import { addTracks, playlistSummary, removeTracks } from '@/server/user-data/playlists';
import { sanitizeTracks } from '@/server/user-data/tracks';
import { PLAYLIST_TRACK_LIMIT } from '@/server/user-data/types';

export const dynamic = 'force-dynamic';

const MAX_BODY = 4 * 1024 * 1024;

/**
 * POST { id, op: 'add', tracks } → { added, playlist }: append songs not listed yet.
 * POST { id, op: 'del', trackIds } → { playlist }: remove songs.
 */
export function POST(request: NextRequest) {
  return respond(async () => {
    const body = await readJson<{ id?: unknown; op?: unknown; tracks?: unknown; trackIds?: unknown }>(request, MAX_BODY);
    if (typeof body.id !== 'string' || !body.id || body.id.length > 64) throw new CatalogError('歌单 ID 无效', 400);
    const db = database();
    if (body.op === 'add') {
      const tracks = sanitizeTracks(body.tracks, PLAYLIST_TRACK_LIMIT);
      if (!tracks.length) throw new CatalogError('没有可添加的歌曲', 400);
      const added = addTracks(db, body.id, tracks);
      return { added, playlist: playlistSummary(db, body.id) };
    }
    if (body.op === 'del') {
      const ids = Array.isArray(body.trackIds) ? body.trackIds.filter((id): id is string => typeof id === 'string').slice(0, PLAYLIST_TRACK_LIMIT) : [];
      return { playlist: removeTracks(db, body.id, ids) };
    }
    throw new CatalogError('未知的歌单操作', 400);
  });
}
