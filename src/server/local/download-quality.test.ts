import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AudioQuality, CatalogProvider } from '../music/types.ts';
import { assertDownloadAccess, inspectDownloadQualities, resolveDownload } from './download-quality.ts';
import { downloadSource } from '../music/netease/playback.ts';

const provider = (source: CatalogProvider['source'], get: CatalogProvider['songSource']) => ({ source, songSource: get }) as CatalogProvider;

test('quality availability follows the authenticated song result, including silent fallbacks and previews', async () => {
  const p = provider('netease', async (id, quality) => ({ id, url: 'https://audio.test/file', level: quality === 'standard' ? quality : 'exhigh', trial: quality === 'higher' ? { start: 0, end: 30 } : undefined }));
  const { options } = await inspectDownloadQualities(p, '123');
  assert.equal(options.find(item => item.quality === 'standard')?.available, true);
  assert.equal(options.find(item => item.quality === 'lossless')?.available, false);
  assert.match(options.find(item => item.quality === 'lossless')!.reason!, /极高/);
  assert.equal(options.find(item => item.quality === 'higher')?.trial, true);
  assert.equal(JSON.stringify(options).includes('https:'), false);
  const unavailable = await inspectDownloadQualities(provider('qq', async () => { throw new Error('请先登录'); }), '123');
  assert.ok(unavailable.options.every(item => !item.available && item.reason === '请先登录'));
  assert.ok(!unavailable.options.some(item => item.quality === 'hires'));
});

test('download validation requires consent for a lower quality and separately for a preview', () => {
  const options = { quality: 'lossless' as AudioQuality, allowTrial: false, allowFallback: false };
  const source = { id: '1', url: 'https://audio.test/file', level: 'exhigh' };
  assert.throws(() => assertDownloadAccess(source, options), /重新选择音质/);
  assert.doesNotThrow(() => assertDownloadAccess(source, { ...options, allowFallback: true }));
  assert.throws(() => assertDownloadAccess({ ...source, trial: { start: 0, end: 30 } }, { ...options, allowFallback: true }), /试听片段/);
  assert.doesNotThrow(() => assertDownloadAccess({ ...source, trial: { start: 0, end: 30 } }, { ...options, allowFallback: true, allowTrial: true }));
  assert.throws(() => assertDownloadAccess({ ...source, level: undefined }, options), /未确认/);
});

test('dedicated download rights are used instead of falling back to playback rights', async t => {
  const p = provider('netease', async () => { throw new Error('playback must not be called'); });
  p.downloadSource = async id => ({ id, url: 'https://audio.test/download', level: 'lossless' });
  assert.equal((await resolveDownload(p, '1', 'lossless')).level, 'lossless');
  p.downloadSource = async () => { throw new Error('没有下载权限'); };
  await assert.rejects(resolveDownload(p, '1', 'lossless'), /没有下载权限/);
  let response: object = { code: 200, data: { id: 123, url: 'http://audio.test/download', level: 'lossless', br: 999000 } };
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    assert.match(String(url), /song\/enhance\/download\/url\/v1/);
    return Response.json(response);
  });
  assert.equal((await downloadSource('123', 'lossless')).url, 'https://audio.test/download');
  response = { code: 200, data: { id: 123, code: -110, url: null } };
  await assert.rejects(downloadSource('123', 'lossless'), /会员或单曲购买权限/);
});
