import type { NextRequest } from 'next/server';
import { CatalogError, readJson, respond } from '@/server/music';
import { database } from '@/server/db/database';
import { listRecentPlays, recordPlay, removeRecentPlays } from '@/server/user-data/listening';
import { sanitizeTrack } from '@/server/user-data/tracks';

export const dynamic = 'force-dynamic';

/**
 * 最近播放 on this machine.
 * GET → { plays } newest first
 * POST { track } — a song started playing
 * DELETE ?id= one entry; without id, all of them
 */
export function GET() {
  return respond(async () => ({ plays: listRecentPlays(database()) }));
}

export function POST(request: NextRequest) {
  return respond(async () => {
    const body = await readJson<{ track?: unknown }>(request);
    const track = sanitizeTrack(body.track);
    if (!track) throw new CatalogError('歌曲信息无效', 400);
    recordPlay(database(), track);
    return { ok: true };
  });
}

export function DELETE(request: NextRequest) {
  return respond(async () => {
    const id = request.nextUrl.searchParams.get('id');
    if (id !== null && (!id || id.length > 200)) throw new CatalogError('歌曲 ID 无效', 400);
    removeRecentPlays(database(), id ?? undefined);
    return { ok: true };
  });
}
