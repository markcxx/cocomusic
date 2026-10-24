import type { NextRequest } from 'next/server';
import QRCode from 'qrcode';
import { account, CatalogError, respond } from '@/server/music';

export const dynamic = 'force-dynamic';

/** POST /api/account/login/qr — new QR login key, its URL, and the QR as SVG markup. */
export function POST(request: NextRequest) {
  return respond(async () => {
    const qr = await account(request.nextUrl.searchParams.get('source')).qrCreate();
    // Platforms that render their own QR send a PNG data URL; wrap it as an SVG <image>
    // so the dialog keeps a single code path.
    const svg = qr.image && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(qr.image)
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><image href="${qr.image}" width="100" height="100" style="image-rendering:pixelated"/></svg>`
      : await QRCode.toString(qr.url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2b2648', light: '#ffffff00' } });
    return { key: qr.key, url: qr.url, svg };
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
