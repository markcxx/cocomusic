import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

function gatewayReply(data: unknown) {
  const bytes = Buffer.from(JSON.stringify({ code: 0, req_0: { code: 0, data } }));
  const key = Buffer.from('7a3f8c1d5e9b2f0a6c4d7e8b1f3a5c9d0e2b6f4a81', 'hex');
  return new Response(Uint8Array.from(bytes, (value, i) => value ^ key[i % key.length]));
}

test('QQ resolves the signed-in listener’s daily card across shelves and keeps playlist order', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'coco-qq-daily-'));
  process.env.COCO_DATA_DIR = dir;
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const require = createRequire(import.meta.url);
  const { session } = require('../session') as typeof import('../session');
  const { dailySongs, featured } = require('./catalog') as typeof import('./catalog');
  const feed = { v_shelf: [{}, { v_niche: [{ v_card: [{ title: '其他推荐' }, { title: '每日30首', id: '123456' }] }] }] };
  const playlist = { dirinfo: { title: '每日30首' }, songlist: [
    { mid: 'secondMid', id: 2, title: '第一首' }, { mid: 'firstMid', id: 1 }, { id: 3 },
  ] };
  const replies = [feed, playlist, { v_shelf: [] }];
  const upstream = t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    assert.match(new Headers(init.headers).get('cookie') ?? '', /qm_keyst=test-key/);
    const data = replies.shift();
    assert.ok(data);
    return gatewayReply(data);
  });
  await assert.rejects(dailySongs(), { status: 401 });
  assert.equal(upstream.mock.callCount(), 0);
  session.set('qq', { uin: '123', qm_keyst: 'test-key' });
  const { tracks } = await dailySongs();
  assert.deepEqual(tracks.map(item => [item.source, item.id]), [['qq', 'secondMid.2'], ['qq', 'firstMid.1']]);
  await assert.rejects(dailySongs(), /未返回「每日30首」/);

  await t.test('desktop cards keep upstream order, optional radio failure is isolated and guests keep public songs', async () => {
    const remoteCards = [
      { type: 700, id: '99', title: '猜你喜欢' },
      { type: 500, id: '123456', title: '每日30首', subtitle: '歌曲-歌手' },
      { type: 900, id: '20000', title: '音乐搭子' },
      { type: 500, id: '345678', title: '百万收藏' },
      { type: 500, id: '456789', title: '新歌推荐' },
      { type: 900, id: '19999', title: '其他客户端入口' },
    ];
    let radioAvailable = true;
    upstream.mock.mockImplementation(async (_url: string, init: RequestInit) => {
      const bytes = Buffer.from(String(init.body), 'base64');
      const decoder = createDecipheriv('aes-128-gcm', Buffer.from('bd305f10d0ff74b6ef54dab835b5e1cf', 'hex'), bytes.subarray(0, 12));
      decoder.setAuthTag(bytes.subarray(-16));
      const { comm, req_0: req } = JSON.parse(Buffer.concat([decoder.update(bytes.subarray(12, -16)), decoder.final()]).toString());
      if (req.method === 'get_recommend_feed') {
        assert.equal(comm.ct, 20);
        assert.equal(comm.authst, 'test-key');
        return gatewayReply({ v_shelf: [{ v_niche: [{ v_card: remoteCards }] }] });
      }
      if (req.method === 'get_radio_track') {
        assert.equal(req.param.id, 99);
        return radioAvailable ? gatewayReply({ tracks: playlist.songlist }) : new Response(null, { status: 503 });
      }
      if (req.method === 'get_new_song_info') {
        assert.equal(comm.uin, 0);
        return gatewayReply({ songlist: [playlist.songlist[0]] });
      }
      return gatewayReply({});
    });
    const home = await featured();
    assert.deepEqual(home.recommendationCards?.map(card => card.title), remoteCards.slice(0, 5).map(card => card.title));
    assert.deepEqual(home.tracks, []);
    const radio = home.recommendationCards?.[0];
    assert.ok(radio?.kind === 'radio');
    assert.deepEqual(radio.tracks.map(track => track.id), ['secondMid.2', 'firstMid.1']);
    assert.equal(home.recommendationCards?.[1].subtitle, '歌曲-歌手');
    radioAvailable = false;
    assert.equal((await featured()).recommendationCards?.length, 4);
    session.clear('qq');
    const guest = await featured();
    assert.equal(guest.recommendationCards, undefined);
    assert.equal(guest.tracks[0].id, 'secondMid.2');
  });
});
