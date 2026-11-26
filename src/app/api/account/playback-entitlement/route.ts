import { account, CatalogError, respond } from '@/server/music';
import { isSource } from '@/server/music/ids';
import { session } from '@/server/music/session';
import { conceptMembership, conceptToday } from '@/server/music/kugou/membership';

export const dynamic = 'force-dynamic';

/** Ranking hint only. The song endpoint checks the actual recording and the user's rights. */
export function GET(request: Request) {
  return respond(async () => {
    const source = new URL(request.url).searchParams.get('source');
    if (!isSource(source)) throw new CatalogError('未知的音乐平台', 400);
    if (source === 'kugou-lite') {
      const user = session.get(source)?.cookie.userid;
      if (!user) return { active: false };
      const value = await conceptMembership();
      const today = conceptToday();
      const expiryDay = value.expiresAt?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
      const active = value.claimedDay === today || ((value.vipType ?? 0) > 0 && (!expiryDay || expiryDay >= today));
      return { active: session.get(source)?.cookie.userid === user && active };
    }
    const profile = await account(source).profile(true);
    return { active: (profile?.vipType ?? 0) > 0 };
  });
}
