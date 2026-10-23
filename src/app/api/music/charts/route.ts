import type { NextRequest } from 'next/server';
import { cached, catalog, intParam, respond } from '@/server/music';

export const dynamic = 'force-dynamic';

/** GET /api/music/charts?limit=8 */
export function GET(request: NextRequest) {
  return respond(async () => {
    const params = request.nextUrl.searchParams;
    const provider = catalog(params.get('source'));
    const limit = intParam(params.get('limit'), 8, 1, 30);
    return cached(`${provider.source}:charts:${limit}`, async () => ({ charts: await provider.charts(limit) }));
  });
}
