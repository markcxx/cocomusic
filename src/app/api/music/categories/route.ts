import type { NextRequest } from 'next/server';
import { cached, catalog, respond } from '@/server/music';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return respond(async () => {
    const provider = catalog(request.nextUrl.searchParams.get('source'));
    return cached(`${provider.source}:categories`, async () => ({ groups: await provider.categories() }), 60 * 60_000);
  });
}
