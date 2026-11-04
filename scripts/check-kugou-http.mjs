import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

// Point this at an isolated local test server, never at a user's signed-in instance.
const origin = process.env.COCO_TEST_ORIGIN;
if (!origin || !process.env.COCO_TEST_TOKEN) throw new Error('Set COCO_TEST_ORIGIN and COCO_TEST_TOKEN for an isolated test server');
const results = [];
async function request(source, endpoint, { method = 'GET', body, status = 200 } = {}) {
  const url = new URL(`/api/${endpoint}`, origin); url.searchParams.set('source', source);
  const response = await fetch(url, { method, headers: { 'x-coco-token': process.env.COCO_TEST_TOKEN, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  assert.equal(response.status, status, `${source} ${method} ${endpoint}: ${data.error ?? response.status}`);
  results.push({ source, endpoint, method, status });
  return data;
}
async function main() {
  for (const source of ['kugou', 'kugou-lite']) {
    const search = await request(source, 'music/search?keyword=周杰伦&type=song&limit=3');
    assert.equal(search.items[0].source, source); const song = search.items[0];
    const artists = await request(source, 'music/search?keyword=周杰伦&type=artist&limit=3');
    const albums = await request(source, 'music/search?keyword=叶惠美&type=album&limit=3');
    await request(source, 'music/search?keyword=华语&type=playlist&limit=3');
    for (const section of ['featured', 'new', 'artists']) await request(source, `music/home?section=${section}`);
    for (const section of ['info', 'biography', 'songs', 'albums']) await request(source, `music/artist?id=${artists.items[0].id}&section=${section}&limit=3`);
    await request(source, `music/album?id=${albums.items[0].id}`);
    for (const section of ['url', 'lyrics', 'stats', 'comments']) await request(source, `music/song?id=${song.id}&section=${section}`);
    for (const endpoint of ['music/search/suggest?keyword=周杰伦', 'music/search/best?keyword=周杰伦', 'music/search/hot', 'music/charts?limit=2', 'music/categories', 'music/artists?limit=5']) await request(source, endpoint);
    const lists = await request(source, 'music/playlists?limit=5');
    assert.ok(lists.items.length); await request(source, `music/playlist?id=${lists.items[0].id}&limit=3`);
    assert.ok((await request(source, `music/mv?id=${song.id}`)).qualities.length);
    assert.equal((await request(source, 'account/me')).profile, null);
    assert.equal((await request(source, 'account/me/detail')).detail, null);
    assert.ok((await request(source, 'account/login/qr', { method: 'POST' })).svg);
    for (const endpoint of ['account/likes', 'account/playlists']) await request(source, endpoint, { status: 401 });
    const id = 'collection_3_3';
    for (const [endpoint, method, body] of [
      ['account/likes', 'POST', { id: song.id, like: true }],
      ['account/playlists', 'POST', { name: '隔离测试', privacy: 'private' }],
      ['account/playlists', 'PATCH', { id, name: '隔离测试' }],
      [`account/playlists?id=${id}`, 'DELETE'],
      ['account/playlists/tracks', 'POST', { playlistId: id, trackIds: [song.id], op: 'add' }],
      ['account/playlists/subscription', 'POST', { id, subscribe: true }],
    ]) await request(source, endpoint, { method, body, status: 401 });
    if (source === 'kugou-lite') {
      await request(source, 'account/membership', { status: 401 });
      await request(source, 'account/membership', { method: 'POST', body: {}, status: 401 });
    }
    console.log(`PASS ${source}: production HTTP catalog and anonymous account protection`);
  }
  await writeFile('docs/kugou-http-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), authenticated: false, results }, null, 2) + '\n');
  console.log(`PASS ${results.length} production HTTP checks`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
