import type { NextRequest } from 'next/server';
import QRCode from 'qrcode';
import { account, CatalogError, respond } from '@/server/music';

export const dynamic = 'force-dynamic';

/** POST /api/account/login/qr — new QR login key, its URL, and the QR as SVG markup. */
export function POST(request: NextRequest) {
  return respond(async () => {
    const qr = await account(request.nextUrl.searchParams.get('source')).qrCreate();
    const svg = await QRCode.toString(qr.url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2b2648', light: '#ffffff00' } });
    return { ...qr, svg };
  });
}

/** GET /api/account/login/qr?key= — poll scan state; on success the session is stored. */
export function GET(request: NextRequest) {
  return respond(async () => {
    const key = request.nextUrl.searchParams.get('key') ?? '';
    if (!/^[\w-]{8,64}$/.test(key)) throw new CatalogError('二维码标识无效', 400);
    return account(request.nextUrl.searchParams.get('source')).qrCheck(key);
  });
}
