import type { NextRequest } from 'next/server';
import { CatalogError, readJson, respond } from '@/server/music';
import { database } from '@/server/db/database';
import { readPlayer, savePosition, saveQueue } from '@/server/user-data/listening';
import { sanitizeTracks } from '@/server/user-data/tracks';
import { QUEUE_LIMIT } from '@/server/user-data/types';

export const dynamic = 'force-dynamic';

const MAX_BODY = 4 * 1024 * 1024;

/**
 * Play queue and resume point, restored (paused) on launch.
 * GET → { queue, currentId?, position? }
 * PUT { queue, currentId? } and/or { position: { id, t } }
 */
export function GET() {
  return respond(async () => readPlayer(database()));
}

export function PUT(request: NextRequest) {
  return respond(async () => {
    const body = await readJson<{ queue?: unknown; currentId?: unknown; position?: unknown }>(request, MAX_BODY);
    const db = database();
    if (body.queue !== undefined) {
      if (!Array.isArray(body.queue)) throw new CatalogError('播放列表无效', 400);
      saveQueue(db, sanitizeTracks(body.queue, QUEUE_LIMIT), typeof body.currentId === 'string' ? body.currentId : undefined);
    }
    if (body.position !== undefined) {
      const position = body.position as { id?: unknown; t?: unknown } | null;
      if (typeof position?.id !== 'string' || typeof position.t !== 'number' || !Number.isFinite(position.t)) throw new CatalogError('播放进度无效', 400);
      savePosition(db, { id: position.id, t: Math.max(0, Math.round(position.t)) });
    }
    return { ok: true };
  });
}
