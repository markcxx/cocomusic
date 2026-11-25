import type { NextRequest } from 'next/server';
import { cached, catalog, CatalogError, intParam, respond } from '@/server/music';
import { MV_AREAS, MV_FEATURES, type MvArea, type MvListKind } from '@/server/music/mv-features';
import { musicVideoList } from '@/server/music/mv-list';

export const dynamic = 'force-dynamic';

const KINDS: MvListKind[] = ['top', 'hot', 'latest', 'search', 'artist'];

/** GET /api/music/mvs?kind=top|hot|latest|search|artist&area=&keyword=&id=&offset=&limit= */
export function GET(request: NextRequest) {
  return respond(async () => {
    const params = request.nextUrl.searchParams;
    const { source } = catalog(params.get('source'));
    const kind = params.get('kind') as MvListKind;
    if (!KINDS.includes(kind)) throw new CatalogError('未知的 MV 列表', 400);
    const features = MV_FEATURES[source];
    const supported = kind === 'search' ? features.search : kind === 'artist' ? features.artist : features.browse.includes(kind);
    if (!supported) throw new CatalogError('当前平台暂不提供这个 MV 列表', 400);
    const area = (params.get('area') ?? '') as MvArea;
    if (!MV_AREAS.some(option => option.id === area)) throw new CatalogError('未知的地区', 400);
    const keyword = (params.get('keyword') ?? '').trim().slice(0, 100);
    const artistId = params.get('id') ?? '';
    const offset = intParam(params.get('offset'), 0, 0, 5000);
    const limit = intParam(params.get('limit'), 30, 1, 30);
    return cached(`${source}:mvs:${kind}:${area}:${keyword}:${artistId}:${offset}:${limit}`, () => musicVideoList(source, { kind, area, keyword, artistId, offset, limit }), 10 * 60_000);
  });
}
