import { respond, CatalogError } from '@/server/music';
import { kugouVideoUrl } from '@/server/music/mv';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const hash = new URL(request.url).searchParams.get('hash') ?? '';
    const range = request.headers.get('range');
    if (range && !/^bytes=\d*-\d*$/.test(range)) throw new CatalogError('无效的视频范围', 416);
    const url = await kugouVideoUrl(hash);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let upstream: Response;
    try {
      upstream = await fetch(url, { headers: { ...(range ? { Range: range } : {}), 'Accept-Encoding': 'identity' }, redirect: 'error', signal: AbortSignal.any([request.signal, controller.signal]), cache: 'no-store' });
    } finally { clearTimeout(timer); }
    if (![200, 206, 416].includes(upstream.status)) { await upstream.body?.cancel(); throw new CatalogError('MV 视频源暂不可用', 502); }
    const headers = new Headers({ 'Cache-Control': 'no-store', 'Content-Type': 'video/mp4', 'X-Content-Type-Options': 'nosniff' });
    for (const key of ['content-length', 'content-range', 'accept-ranges']) { const value = upstream.headers.get(key); if (value) headers.set(key, value); }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) { return respond(() => Promise.reject(error)); }
}
