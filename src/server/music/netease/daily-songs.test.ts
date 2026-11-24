import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('daily songs require a NetEase session and preserve each listener’s recommendations in order', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'coco-daily-songs-'));
  const previous = process.env.COCO_DATA_DIR;
  process.env.COCO_DATA_DIR = dir;
  t.after(() => {
    if (previous === undefined) delete process.env.COCO_DATA_DIR; else process.env.COCO_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  });
  const require = createRequire(import.meta.url);
  const { NextRequest } = require('next/server') as typeof import('next/server');
  const { GET } = require('../../../app/api/music/home/route') as typeof import('../../../app/api/music/home/route');
  const { session } = require('../session') as typeof import('../session');
  const request = (source = 'netease') => GET(new NextRequest(`http://localhost/api/music/home?section=daily-songs&source=${source}`));
  let ids = [92, 18];
  let calls = 0;
  const upstream = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls++;
    assert.equal(url, 'https://music.163.com/weapi/v3/discovery/recommend/songs');
    assert.equal(init.method, 'POST');
    assert.match(new Headers(init.headers).get('Cookie') ?? '', /os=ios/);
    return Response.json({ code: 200, data: { dailySongs: ids.map(id => ({ id, name: `歌曲 ${id}`, ar: [{ name: '歌手' }], dt: 170000 })) } });
  });
  assert.equal((await request()).status, 401);
  for (const source of ['qq', 'kugou', 'kugou-lite']) assert.equal((await request(source)).status, 401);
  assert.equal(calls, 0);
  session.set('netease', { MUSIC_U: 'first-listener' });
  const first = await (await request()).json();
  assert.deepEqual(first.tracks.map((t: { id: string }) => t.id), ['92', '18']);
  assert.equal(first.tracks[0].artist, '歌手');
  assert.equal(first.tracks[0].duration, 170);
  session.set('netease', { MUSIC_U: 'second-listener' });
  ids = [];
  assert.deepEqual(await (await request()).json(), { tracks: [] });
  upstream.mock.mockImplementation(async () => Response.json({ code: 301 }));
  assert.equal((await request()).status, 401);

  await t.test('featured selects both feeds by listener and keeps guest and account caches separate', async () => {
    session.clear('netease');
    const fmListeners: string[] = [];
    const shelfListeners: string[] = [];
    const featured = () => GET(new NextRequest('http://localhost/api/music/home?section=featured&source=netease'));
    upstream.mock.mockImplementation(async (url: string, init: RequestInit) => {
      const cookie = new Headers(init.headers).get('Cookie') ?? '';
      const listener = /(?:^|; )MUSIC_U=(\w+)/.exec(cookie)?.[1];
      switch (new URL(url).pathname) {
        case '/weapi/toplist/detail': return Response.json({ code: 200, list: [] });
        case '/weapi/personalized/playlist':
          assert.equal(listener, undefined);
          return Response.json({ code: 200, result: [{ id: 'guest-list' }] });
        case '/weapi/personalized/newsong':
          assert.equal(listener, undefined);
          return Response.json({ code: 200, result: [{ song: { id: 'guest-song' } }] });
        case '/weapi/v1/discovery/recommend/resource':
          assert.ok(listener);
          return Response.json({ code: 200, recommend: [{ id: listener + '-list', playcount: 25 }] });
        case '/weapi/v1/radio/get':
          fmListeners.push(listener ?? 'guest');
          if (listener === 'bob') return Response.json({ code: 503 });
          return Response.json({ code: 200, data: [{ id: 123, name: 'FM 单曲' }, { name: '缺少 ID' }] });
        case '/weapi/homepage/block/page': {
          shelfListeners.push(listener ?? 'guest');
          if (listener === 'bob') return Response.json({ code: 503 });
          const list = (resourceId: string, resourceType = 'list') => ({ resourceType, resourceId, uiElement: {
            mainTitle: { title: '推荐 ' + resourceId }, image: { imageUrl: 'https://img.test/list.jpg' },
          } });
          return Response.json({ code: 200, data: { blocks: [
            { blockCode: 'HOMEPAGE_BLOCK_MGC_PLAYLIST', creatives: [{ resources: [list('1', 'song'), list('12'), list('13'), list('16')] }] },
            { blockCode: 'HOMEPAGE_BLOCK_OFFICIAL_PLAYLIST', creatives: [{ resources: [list('12'), list('bad'), list('14')] }] },
          ] } });
        }
        case '/weapi/v3/discovery/recommend/songs':
          assert.ok(listener);
          return Response.json({ code: 200, data: { dailySongs: [{ id: listener + '-song' }] } });
        default: throw new Error('Unexpected upstream path: ' + new URL(url).pathname);
      }
    });
    for (const listener of ['guest', 'alice', 'bob', 'guest']) {
      if (listener === 'guest') session.clear('netease');
      else session.set('netease', { MUSIC_U: listener }, { source: 'netease', id: listener, nickname: listener });
      const response = await featured();
      assert.equal(response.status, 200);
      const home = await response.json();
      assert.equal(home.dailyPlaylists, listener !== 'guest');
      assert.equal(home.dailySongs, listener !== 'guest');
      assert.deepEqual(home.tracks.map((song: { id: string }) => song.id), [listener + '-song']);
      assert.deepEqual(home.playlists.map((list: { id: string }) => list.id), [listener + '-list']);
      const cards = home.recommendationCards;
      if (listener === 'alice') {
        assert.deepEqual(cards.map((card: {kind: string}) => card.kind), ['radio', 'daily', 'playlist', 'playlist', 'playlist']);
        assert.deepEqual(cards[0].tracks.map((track: {id: string}) => track.id), ['123']);
        assert.equal(cards[1].subtitle, '今日推荐 · 1 首');
        assert.deepEqual(cards.slice(2).map((card: {id: string}) => card.id), ['12', '13', '14']);
      } else if (listener === 'bob') {
        assert.deepEqual(cards.map((card: {kind: string}) => card.kind), ['daily']);
      } else {
        assert.deepEqual(cards, []);
      }
      if (listener !== 'guest') {
        assert.equal(home.playlists[0].playCount, 25);
        assert.deepEqual((await (await request()).json()).tracks, home.tracks);
      }
    }
    assert.deepEqual(fmListeners, ['alice', 'bob']);
    assert.deepEqual(shelfListeners, ['alice', 'bob']);
  });
});
