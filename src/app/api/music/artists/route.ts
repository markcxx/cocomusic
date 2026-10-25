import type { NextRequest } from 'next/server';
import { cached, catalog, intParam, respond } from '@/server/music';
import { artistDirectory } from '@/server/music/artist-directory';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return respond(async () => {
    const params = request.nextUrl.searchParams;
    const { source } = catalog(params.get('source'));
    const query = { area: params.get('area') ?? '', type: params.get('type') ?? '', genre: params.get('genre') ?? '', initial: params.get('initial') ?? '', offset: intParam(params.get('offset'), 0, 0, 100000), limit: intParam(params.get('limit'), 48, 1, 80) };
    return cached(`artist-directory:${source}:${JSON.stringify(query)}`, () => artistDirectory(source, query), 30 * 60_000);
  });
}
