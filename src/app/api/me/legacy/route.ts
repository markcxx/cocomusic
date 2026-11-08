import type { NextRequest } from 'next/server';
import { readJson, respond } from '@/server/music';
import { database } from '@/server/db/database';
import { importRendererData, rendererImportPending, type RendererLegacyData } from '@/server/user-data/legacy';

export const dynamic = 'force-dynamic';

/** Four preference values of up to 4 MB each (the old per-key cap). */
const MAX_BODY = 18 * 1024 * 1024;

/**
 * One-time hand-over of data earlier versions kept in the renderer's preferences.
 * GET → { pending }: whether the import still has to run
 * POST { recentPlays, localPlaylists, queue, position } (raw stored strings) → { ok }
 */
export function GET() {
  return respond(async () => ({ pending: rendererImportPending(database()) }));
}

export function POST(request: NextRequest) {
  return respond(async () => {
    const body = await readJson<RendererLegacyData>(request, MAX_BODY);
    importRendererData(database(), body);
    return { ok: true };
  });
}
