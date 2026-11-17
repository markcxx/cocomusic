import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCoverUrl } from './cover-quality';

test('upgrades NetEase, QQ, and Kugou artwork URLs for large covers', () => {
  const netease = 'https://p1.music.126.net/abc/123.jpg?param=200y200';
  assert.equal(resolveCoverUrl(netease, 'standard'), netease);
  assert.equal(resolveCoverUrl(netease, 'high'), 'https://p1.music.126.net/abc/123.jpg?param=800y800');
  assert.equal(resolveCoverUrl(netease, 'original'), 'https://p1.music.126.net/abc/123.jpg');

  const qq = 'https://y.gtimg.cn/music/photo_new/T002R300x300M000abc.jpg';
  assert.equal(resolveCoverUrl(qq, 'high'), 'https://y.gtimg.cn/music/photo_new/T002R800x800M000abc.jpg');
  assert.equal(resolveCoverUrl(qq, 'original'), 'https://y.gtimg.cn/music/photo_new/T002R800x800M000abc.jpg');

  const kugou = 'https://imge.kugou.com/stdmusic/400/20230101/abc.jpg';
  assert.equal(resolveCoverUrl(kugou, 'high'), 'https://imge.kugou.com/stdmusic/800/20230101/abc.jpg');
});

test('keeps small list thumbnails untouched for performance', () => {
  const netease = 'https://p1.music.126.net/abc/123.jpg?param=200y200';
  assert.equal(resolveCoverUrl(netease, 'original', 36), netease);
  assert.equal(resolveCoverUrl(netease, 'high', 52), netease);
});
