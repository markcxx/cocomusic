import assert from 'node:assert/strict';
import { test } from 'node:test';
import { artistText, mapBiography } from './artist-biography.ts';
import { artistBiography } from './netease/artists.ts';

test('biographies normalize upstream sections and preserve paragraph breaks as plain text', () => {
  assert.equal(artistText('<p>歌手<br>介绍</p>'), '歌手\n介绍');
  assert.deepEqual(mapBiography('简介', [{ ti: '经历', txt: '第一段\r\n第二段' }, { title: '作品', content: '<b>专辑</b>' }, null, { ti: '空白', txt: '' }]), { brief: '简介', sections: [{ title: '经历', text: '第一段\n第二段' }, { title: '作品', text: '专辑' }] });
  assert.deepEqual(mapBiography(null, {}), { brief: '', sections: [] });
});

test('NetEase biography requests and maps the introduction endpoint', async t => {
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    assert.match(String(url), /weapi\/artist\/introduction/);
    return Response.json({ code: 200, briefDesc: '歌手简介', introduction: [{ ti: '代表作品', txt: '作品一\n作品二' }] });
  });
  assert.deepEqual(await artistBiography('6452'), { brief: '歌手简介', sections: [{ title: '代表作品', text: '作品一\n作品二' }] });
});
