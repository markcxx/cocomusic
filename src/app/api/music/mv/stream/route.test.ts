import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GET } from './route';
import { musicVideo } from '@/server/music/mv';

test('Kugou filters fan uploads and preserves official quality hashes', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ status: 1, data: [[
    { is_ugc: 1, is_publish: 1, have_mp4: 1, mv_name: 'fan cover' },
    { is_ugc: 0, is_publish: 1, have_mp4: 1, mv_name: 'official', video_id: 1, singer: 'artist', h264: { hd_hash: 'a'.repeat(32), hd_width: 1280, hd_height: 720 } },
  ]] });
  try {
    const mv = await musicVideo('kugou', 'hash..123');
    assert.equal(mv.title, 'official');
    assert.deepEqual(mv.qualities, [{ id: 'hd', label: '720P', url: `/api/music/mv/stream?hash=${'a'.repeat(32)}` }]);
  } finally { globalThis.fetch = original; }
});
test('video proxy streams byte ranges and forwards upstream range metadata', async () => {
  const original = globalThis.fetch;
  const hash = 'a'.repeat(32);
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('gateway.kugou.com')) return Response.json({ status: 1, data: { [hash]: { downurl: 'http://fsmvpc.kugou.com/a.mp4' } } });
    assert.equal(new Headers(init?.headers).get('range'), 'bytes=10-12');
    assert.equal(init?.redirect, 'error');
    return new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { 'Content-Range': 'bytes 10-12/100', 'Content-Length': '3', 'Accept-Ranges': 'bytes' } });
  };
  try {
    const response = await GET(new Request(`http://localhost/api/music/mv/stream?hash=${hash}`, { headers: { Range: 'bytes=10-12' } }));
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 10-12/100');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
  } finally { globalThis.fetch = original; }
});
test('video proxy refuses arbitrary upstream hosts', async () => {
  const original = globalThis.fetch;
  const hash = 'b'.repeat(32);
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ status: 1, data: { [hash]: { downurl: 'http://127.0.0.1/private' } } }); };
  try {
    const response = await GET(new Request(`http://localhost/api/music/mv/stream?hash=${hash}`));
    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
