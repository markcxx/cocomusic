import type { NextRequest } from 'next/server';
import { account, cached, respond } from '@/server/music';

export const dynamic = 'force-dynamic';

/** GET /api/account/me/detail — full profile for the account card (requires login). */
export function GET(request: NextRequest) {
  return respond(async () => {
    const source = request.nextUrl.searchParams.get('source') || 'netease';
    const provider = account(source);
    // Keyed per session so a different login never sees a stale card.
    const me = await provider.profile();
    if (!me) return { detail: null };
    return { detail: await cached(`${source}:me-detail:${me.id}`, () => provider.detail(), 2 * 60_000) };
  });
}
