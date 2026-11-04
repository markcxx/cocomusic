import { CatalogError, readJson, respond } from '@/server/music';
import { claimConceptMembership, conceptMembership } from '@/server/music/kugou/membership';
import { autoConceptCheckIn } from '@/server/music/kugou/auto-check-in';

export const dynamic = 'force-dynamic';
function source(request: Request) {
  if (new URL(request.url).searchParams.get('source') !== 'kugou-lite') throw new CatalogError('请选择酷狗概念版', 400);
}
export function GET(request: Request) {
  return respond(async () => { source(request); return conceptMembership(); });
}
export function POST(request: Request) {
  return respond(async () => {
    source(request);
    const body = await readJson<{ action?: unknown; retry?: unknown }>(request);
    if (body.action === 'auto') return autoConceptCheckIn(body.retry === true);
    if (body.action !== undefined && body.action !== 'claim') throw new CatalogError('未知的签到操作', 400);
    return claimConceptMembership();
  });
}
