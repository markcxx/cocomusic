import type { NextRequest } from 'next/server';
import { cached, catalog, CatalogError, respond } from '@/server/music';
import { validId } from '@/server/music/ids';
import { AUDIO_QUALITIES, type AudioQuality } from '@/server/music/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/music/song?id=&section=url|lyrics|stats (comments: /api/music/comments)
 * - url: playable stream (&quality=standard|higher|exhigh|lossless|hires) (never cached: links expire and depend on the login)
 * - lyrics: synced lines with translations
 * - stats: like (红心) and comment counts
 */
export function GET(request: NextRequest) {
  return respond(async () => {
    const params = request.nextUrl.searchParams;
    const provider = catalog(params.get('source'));
    const id = params.get('id') ?? '';
    if (!validId(provider.source, 'song', id)) throw new CatalogError('歌曲 ID 格式不正确', 400);
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
      default: throw new CatalogError('未知的歌曲板块', 400);
    }
  });
}
