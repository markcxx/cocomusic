import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mediaUrl, musicVideo, qqQualities, kugouVideoUrl } from './mv';

test('MV media accepts web URLs only and never embedded credentials', () => {
  assert.equal(mediaUrl('http://example.com/a.mp4'), 'https://example.com/a.mp4');
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', '//host/a', 'https://user:secret@host/a', '']) assert.equal(mediaUrl(url), '');
});
test('QQ excludes restricted and empty renditions and orders available quality', () => {
  assert.deepEqual(qqQualities([
    { filetype: 10, code: 0, freeflow_url: ['http://example.com/sd.mp4'] },
    { filetype: 20, code: 0, freeflow_url: [] },
    { filetype: 30, code: 0, freeflow_url: ['http://example.com/hd.mp4', 'https://example.com/hd.mp4'] },
    { filetype: 40, code: 1000, freeflow_url: ['https://example.com/restricted.mp4'] },
  ]), [{ id: '30', label: '超清', url: 'https://example.com/hd.mp4' }, { id: '10', label: '标清', url: 'https://example.com/sd.mp4' }]);
});
test('invalid video hashes and song ids are rejected before network access', async () => {
  await assert.rejects(() => kugouVideoUrl('http://127.0.0.1'), /视频标识无效/);
  await assert.rejects(() => musicVideo('netease', '../secret'), /歌曲标识无效/);
  await assert.rejects(() => musicVideo('kugou', 'missing-album-id'), /暂无可播放/);
});
