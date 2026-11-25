import { catalog, respond } from '@/server/music';
import { musicVideo, musicVideoById } from '@/server/music/mv';

export const dynamic = 'force-dynamic';
/** GET /api/music/mv?id=<song id> (the song's official MV) or ?mvid=<MV id from a list> */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const mvid = query.get('mvid');
  return respond(() => {
    const { source } = catalog(query.get('source'));
    return mvid ? musicVideoById(source, mvid) : musicVideo(source, query.get('id') ?? '');
  });
}
