import type { NextRequest } from 'next/server';
import { account, catalog, invalidate, respond } from '@/server/music';
import { session } from '@/server/music/session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/account/me — current profile, or { profile: null } when logged out.
 * `expired` is true once when the platform rejected the stored login (so the UI
 * can say so instead of silently falling back to previews).
 */
export function GET(request: NextRequest) {
  return respond(async () => {
    const source = request.nextUrl.searchParams.get('source');
    const profile = await account(source).profile();
    const expired = session.takeExpired(catalog(source).source);
    if (expired) invalidate(`${catalog(source).source}:`);
    return { profile, expired };
  });
}

/** DELETE /api/account/me — log out and forget the stored session. */
export function DELETE(request: NextRequest) {
  return respond(async () => {
    const source = request.nextUrl.searchParams.get('source');
    await account(source).logout();
    invalidate(`${source || 'netease'}:`);
    return { ok: true };
  });
}
