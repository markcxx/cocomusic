import type { NextRequest } from 'next/server';
import { account, invalidate, respond } from '@/server/music';

export const dynamic = 'force-dynamic';

/** GET /api/account/me — current profile, or { profile: null } when logged out. */
export function GET(request: NextRequest) {
  return respond(async () => ({ profile: await account(request.nextUrl.searchParams.get('source')).profile() }));
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
