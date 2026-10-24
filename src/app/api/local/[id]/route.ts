import type { NextRequest } from 'next/server';
import { respond } from '@/server/music';
import { coverOf, getTrack, lyricsOf } from '@/server/local/library';
import { streamFile } from '@/server/local/stream';

export const dynamic = 'force-dynamic';

const ID = /^[a-f0-9]{20}$/;

/**
 * GET /api/local/:id?part=audio|cover|lyrics
 * Only indexed files are served; the id is a hash, never a path.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return new Response('Bad request', { status: 400 });
  const part = request.nextUrl.searchParams.get('part') ?? 'audio';
  const track = getTrack(id);
  if (!track) return new Response('Not found', { status: 404 });

  if (part === 'audio') return streamFile(track.path, request.headers.get('range'));
  if (part === 'cover') {
    const cover = await coverOf(id);
    if (!cover) return new Response('Not found', { status: 404 });
    return new Response(new Uint8Array(cover.data), { headers: { 'Content-Type': cover.type, 'Cache-Control': 'private, max-age=86400' } });
  }
  if (part === 'lyrics') return respond(() => lyricsOf(id));
  return new Response('Bad request', { status: 400 });
}
