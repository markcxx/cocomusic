import type { NextRequest } from 'next/server';
import { cached, CatalogError, respond } from '@/server/music';
import { isSource } from '@/server/music/ids';
import { resolveSharedPlaylist, shareSource } from '@/server/music/share-link';

export const dynamic = 'force-dynamic';

const MAX_TEXT = 2000;

/**
 * GET /api/music/share?text=&source= — the playlist behind pasted share text
 * (a long link or a platform short link) as `{ source, id }`. `source` is the
 * selected platform, used to keep Kugou links on 酷狗概念版 when that is active.
 */
export function GET(request: NextRequest) {
  return respond(async () => {
    const params = request.nextUrl.searchParams;
    const text = (params.get('text') ?? '').trim();
    if (!text) throw new CatalogError('请粘贴歌单的分享链接', 400);
    if (text.length > MAX_TEXT) throw new CatalogError('粘贴的内容过长', 400);
    const selected = params.get('source');
    // Short links resolve over the network; the same paste resolves to the same playlist for a while.
    const shared = await cached(`share:${text}`, () => resolveSharedPlaylist(text), 10 * 60_000);
    return { source: shareSource(shared.platform, isSource(selected) ? selected : 'netease'), id: shared.id };
  });
}
