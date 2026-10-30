import { catalog, respond } from '@/server/music';
import { musicVideo } from '@/server/music/mv';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  return respond(() => musicVideo(catalog(query.get('source')).source, query.get('id') ?? ''));
}
