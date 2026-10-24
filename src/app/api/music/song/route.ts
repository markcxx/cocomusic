import type { NextRequest } from 'next/server';
import { cached, catalog, CatalogError, intParam, respond } from '@/server/music';
import { AUDIO_QUALITIES, type AudioQuality, type CommentSort } from '@/server/music/types';

export const dynamic = 'force-dynamic';

const sorts: CommentSort[] = ['recommend', 'hot', 'latest'];

/**
 * GET /api/music/song?id=&section=url|lyrics|stats|comments
 * - url: playable stream (&quality=standard|higher|exhigh|lossless|hires) (never cached: links expire and depend on the login)
 * - lyrics: synced lines with translations
 * - stats: like (红心) and comment counts
 * - comments: &sort=recommend|hot|latest&cursor=&limit=
 */
export function GET(request: NextRequest) {
  return respond(async () => {
    const params = request.nextUrl.searchParams;
    const provider = catalog(params.get('source'));
    const id = params.get('id') ?? '';
    if (!/^\d{1,20}$/.test(id)) throw new CatalogError('歌曲 ID 格式不正确', 400);
    const section = params.get('section') ?? 'url';
    const prefix = `${provider.source}:song:${id}`;
    switch (section) {
      case 'url': {
        const quality = (params.get('quality') ?? 'exhigh') as AudioQuality;
        if (!AUDIO_QUALITIES.includes(quality)) throw new CatalogError('未知的音质', 400);
        return provider.songSource(id, quality);
      }
      case 'lyrics': return cached(`${prefix}:lyrics`, () => provider.lyrics(id), 60 * 60_000);
      case 'stats': return cached(`${prefix}:stats`, () => provider.songStats(id), 5 * 60_000);
      case 'comments': {
        const sort = (params.get('sort') ?? 'recommend') as CommentSort;
        if (!sorts.includes(sort)) throw new CatalogError('未知的评论排序', 400);
        const cursor = params.get('cursor') ?? undefined;
        if (cursor && cursor.length > 64) throw new CatalogError('分页参数无效', 400);
        const limit = intParam(params.get('limit'), 20, 1, 50);
        return cached(`${prefix}:comments:${sort}:${cursor ?? ''}:${limit}`, () => provider.comments(id, sort, cursor, limit), 60_000);
      }
      default: throw new CatalogError('未知的歌曲板块', 400);
    }
  });
}
