import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function isAllowedRemoteUrl(raw: string): URL | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** GET /api/music/cover?url=...&name=... — same-origin cover download proxy. */
export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url') ?? '';
  const target = isAllowedRemoteUrl(rawUrl);
  if (!target) return Response.json({ error: '无效的封面地址' }, { status: 400 });

  const upstream = await fetch(target.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    redirect: 'follow',
  }).catch(() => null);

  if (!upstream || !upstream.ok) {
    return Response.json({ error: '无法获取封面图片' }, { status: 502 });
  }

  const contentType = (upstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!contentType.startsWith('image/')) {
    return Response.json({ error: '响应不是图片格式' }, { status: 400 });
  }

  const ext = EXT_BY_MIME[contentType] ?? '.jpg';
  const rawName = request.nextUrl.searchParams.get('name') ?? 'cover';
  const safeName = rawName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'cover';

  return new Response(upstream.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="cover${ext}"; filename*=UTF-8''${encodeURIComponent(`${safeName}${ext}`)}`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
