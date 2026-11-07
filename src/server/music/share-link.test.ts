import assert from 'node:assert/strict';
import test from 'node:test';
import { extractUrls, parsePlaylistUrl, resolveSharedPlaylist, shareSource } from './share-link';

const parse = (url: string) => parsePlaylistUrl(new URL(url));

test('NetEase playlist links: web, hash route and mobile share page', () => {
  assert.deepEqual(parse('https://music.163.com/playlist?id=17461074468&userid=1'), { platform: 'netease', id: '17461074468' });
  assert.deepEqual(parse('https://music.163.com/#/playlist?id=3778678'), { platform: 'netease', id: '3778678' });
  assert.deepEqual(parse('https://y.music.163.com/m/playlist?id=8596628206&uct2=x'), { platform: 'netease', id: '8596628206' });
  assert.equal(parse('https://music.163.com/#/album?id=3778678'), null);
});

test('QQ playlist links: ryqq path and taoge share page', () => {
  assert.deepEqual(parse('https://y.qq.com/n/ryqq/playlist/7280525088'), { platform: 'qq', id: '7280525088' });
  assert.deepEqual(parse('https://y.qq.com/n/yqq/playlist/7280525088.html'), { platform: 'qq', id: '7280525088' });
  assert.deepEqual(parse('https://i.y.qq.com/n2/m/share/details/taoge.html?platform=11&id=7275588893&hosteuin=abc'), { platform: 'qq', id: '7275588893' });
  assert.equal(parse('https://y.qq.com/n/ryqq/albumDetail/002fRO0N4FftzY'), null);
});

test('Kugou playlist links: songlist path and zlist share page', () => {
  assert.deepEqual(parse('https://www.kugou.com/songlist/collection_3_671372005_130_0/'), { platform: 'kugou', id: 'collection_3_671372005_130_0' });
  assert.deepEqual(
    parse('https://www.kugou.com/share/zlist.html?u=1012067831&listid=2&global_collection_id=collection_3_1012067831_2_0&uid=1012067831'),
    { platform: 'kugou', id: 'collection_3_1012067831_2_0' },
  );
});

test('lookalike hosts and malformed ids are not playlists', () => {
  assert.equal(parse('https://music.163.com.evil.test/playlist?id=1'), null);
  assert.equal(parse('https://evil-kugou.com/songlist/collection_3_1_2_0/'), null);
  assert.equal(parse('https://music.163.com/playlist?id=1;rm'), null);
});

test('URLs are pulled out of share text with Chinese punctuation around them', () => {
  const urls = extractUrls('分享歌单《华语经典》：https://163cn.tv/abc123（来自@网易云音乐）');
  assert.deepEqual(urls.map(url => url.href), ['https://163cn.tv/abc123']);
});

test('Kugou links open on 酷狗概念版 only while it is the selected platform', () => {
  assert.equal(shareSource('kugou', 'kugou-lite'), 'kugou-lite');
  assert.equal(shareSource('kugou', 'netease'), 'kugou');
  assert.equal(shareSource('qq', 'kugou-lite'), 'qq');
});

test('long links resolve without network; other text is rejected with a reason', async () => {
  assert.deepEqual(await resolveSharedPlaylist('看看这个 https://y.qq.com/n/ryqq/playlist/7280525088 好听'), { platform: 'qq', id: '7280525088' });
  await assert.rejects(resolveSharedPlaylist('没有链接'), /没有找到链接/);
  await assert.rejects(resolveSharedPlaylist('https://example.com/playlist?id=1'), /暂只支持/);
});
