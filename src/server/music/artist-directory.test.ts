import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDecipheriv } from 'node:crypto';
import { NextRequest } from 'next/server';
import { artistDirectory, validateArtistQuery } from './artist-directory.ts';
import { GET } from '../../app/api/music/artists/route.ts';

const query = { area: '', type: '', genre: '', initial: '', offset: 0, limit: 48 };

test('artist filters validate platform-specific ids and pagination before requesting upstream', () => {
  assert.doesNotThrow(() => validateArtistQuery('qq', { ...query, type: '0', area: '200', genre: '6', initial: 'Z' }));
  for (const invalid of [{ area: 'invalid' }, { initial: 'a' }, { offset: -1 }, { limit: 81 }, { genre: '1' }]) assert.throws(() => validateArtistQuery('netease', { ...query, ...invalid }), /无效/);
});

test('NetEase directory maps artists and preserves the upstream more flag without inventing a total', async t => {
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    assert.match(String(url), /weapi\/v1\/artist\/list/);
    return Response.json({ code: 200, more: true, artists: [{ id: 6452, name: '周杰伦' }] });
  });
  const page = await artistDirectory('netease', { ...query, offset: 48, area: '7', type: '1', initial: 'Z' });
  assert.equal(page.items[0].id, '6452');
  assert.equal(page.hasMore, true);
  assert.equal(page.total, 49);
});

test('QQ directory adapts fixed 80-row pages without skipping artists at the UI page boundary', async t => {
  const starts: number[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => {
    const bytes = Buffer.from(String(init?.body), 'base64');
    const decoder = createDecipheriv('aes-128-gcm', Buffer.from('bd305f10d0ff74b6ef54dab835b5e1cf', 'hex'), bytes.subarray(0, 12));
    decoder.setAuthTag(bytes.subarray(-16));
    const body = JSON.parse(Buffer.concat([decoder.update(bytes.subarray(12, -16)), decoder.final()]).toString('utf8'));
    const param = body.req_0.param;
    starts.push(param.sin);
    assert.equal(param.sex, 0); // QQ requires numeric filter ids; male 0 must not become the all sentinel.
    assert.equal(param.index, 2);
    const singerlist = Array.from({ length: Math.min(80, 120 - param.sin) }, (_, i) => ({ singer_mid: `mid${param.sin + i}`, singer_name: `歌手${param.sin + i}` }));
    const json = Buffer.from(JSON.stringify({ code: 0, req_0: { code: 0, data: { total: 120, singerlist } } }));
    const key = Buffer.from('7a3f8c1d5e9b2f0a6c4d7e8b1f3a5c9d0e2b6f4a81', 'hex');
    return new Response(Buffer.from(json.map((byte, index) => byte ^ key[index % key.length])));
  });
  const pages = [];
  let offset = 0;
  for (let i = 0; i < 3; i++) { const page = await artistDirectory('qq', { ...query, type: '0', initial: 'B', offset }); pages.push(page); offset += page.items.length; }
  assert.deepEqual(starts, [0, 80]); // Reuse an 80-row native page for both UI slices.
  const ids = pages.flatMap(page => page.items.map(item => item.id));
  assert.equal(ids.length, 120);
  assert.equal(new Set(ids).size, 120);
  assert.equal(ids[79], 'mid79');
  assert.equal(ids[80], 'mid80');
  assert.equal(pages[2].hasMore, false);
});

test('Kugou directory deduplicates the hot and letter groups and filters letters before slicing', async t => {
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    const params = new URL(String(url)).searchParams;
    assert.equal(params.get('type'), '1');
    assert.equal(params.get('sextype'), '2');
    return Response.json({ status: 1, data: { info: [{ title: '热门', singer: [{ singerid: 1, singername: '阿甲' }] }, { title: 'A', singer: [{ singerid: 1, singername: '阿甲' }, { singerid: 2, singername: '阿乙' }] }, { title: 'B', singer: [{ singerid: 3, singername: '白丙' }] }] } });
  });
  const page = await artistDirectory('kugou', { ...query, area: '1', type: '2', limit: 2 });
  assert.equal(page.total, 3);
  assert.equal(page.hasMore, true);
  const next = await artistDirectory('kugou', { ...query, area: '1', type: '2', offset: 2, limit: 2 });
  assert.deepEqual(next.items.map(item => item.id), ['3']);
  const letter = await artistDirectory('kugou', { ...query, area: '1', type: '2', initial: 'B' });
  assert.equal(letter.total, 1);
  assert.equal(letter.items[0].name, '白丙');
});

test('artist directory route rejects invalid filters, unknown sources and bad offsets', async () => {
  for (const params of ['source=invalid', 'source=netease&area=unknown', 'source=qq&offset=-1', 'source=kugou&genre=1']) {
    const response = await GET(new NextRequest(`http://localhost/api/music/artists?${params}`));
    assert.equal(response.status, 400);
  }
});
