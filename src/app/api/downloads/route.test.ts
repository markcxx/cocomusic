import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from './route.ts';
import type { AudioQuality } from '@/server/music/types';
import { qqProvider } from '@/server/music/qq/provider';

const post = (body: unknown) => POST(new NextRequest('http://localhost/api/downloads', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }));

test('download API validates choices and returns account-scoped availability without stream URLs', async t => {
  for (const options of [undefined, { quality: 'ultra', lyrics: false, allowTrial: false, allowFallback: false }, { quality: 'lossless', lyrics: 'yes', allowTrial: false, allowFallback: false }]) {
    assert.equal((await post({ action: 'add', tracks: [], options })).status, 400);
  }
  assert.equal((await post({ action: 'qualities', track: { id: 'invalid', source: 'netease', title: 'test' } })).status, 400);
  t.mock.method(qqProvider, 'songSource', async (id: string, quality?: AudioQuality) => ({ id, url: 'https://secret.test/signed-audio', level: quality === 'lossless' ? 'exhigh' : quality }));
  const response = await post({ action: 'qualities', track: { id: '0039MnYb0qxYhV.97773', source: 'qq', title: '歌曲' } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.options.find((item: { quality: string }) => item.quality === 'lossless').available, false);
  assert.equal(JSON.stringify(body).includes('signed-audio'), false);
});
