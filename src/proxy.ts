import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

function sameToken(candidate: string | undefined, expected: string) {
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The Next server listens on loopback, which any local process or web page
 * can reach. Only the Electron window (cookie) and main process (header) hold the token.
 * Without COCO_SESSION_TOKEN (`npm run dev:web` in a browser) checks are skipped.
 */
export function proxy(request: NextRequest) {
  const expected = process.env['COCO_SESSION_TOKEN'];
  if (!expected) return NextResponse.next();

  // Reject DNS-rebinding style requests that reach the port under another host name.
  const host = request.headers.get('host') ?? '';
  if (host !== `127.0.0.1:${process.env['PORT']}`) return new NextResponse('Forbidden', { status: 403 });

  const token = request.cookies.get('coco_token')?.value ?? request.headers.get('x-coco-token') ?? undefined;
  if (!sameToken(token, expected)) return new NextResponse('Forbidden', { status: 403 });

  // State-changing account calls must come from the app's own page.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('origin');
    if (origin && origin !== `http://${host}`) return new NextResponse('Forbidden', { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
