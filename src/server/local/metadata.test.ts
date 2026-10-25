import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import { embedMetadata } from './metadata.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWOQAAAAASUVORK5CYII=', 'base64');

for (const extension of ['mp3', 'flac', 'm4a', 'ogg', 'wav']) {
  test(`writes readable title, artist, album and embedded artwork to ${extension}`, async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'coco-tags-'));
    t.mock.method(globalThis, 'fetch', async () => new Response(png));
    try {
      const file = path.join(dir, `song.${extension}.part`);
      await copyFile(new URL(`./fixtures/silence.${extension}`, import.meta.url), file);
      assert.equal(await embedMetadata(file, extension, { title: '测试歌曲', artist: '测试歌手', album: '测试专辑', cover: 'https://example.test/cover.png' }), undefined);
      const tagged = path.join(dir, `song.${extension}`);
      await copyFile(file, tagged);
      const result = await parseFile(tagged);
      assert.equal(result.common.title, '测试歌曲');
      assert.equal(result.common.artist, '测试歌手');
      assert.equal(result.common.album, '测试专辑');
      assert.deepEqual(Buffer.from(result.common.picture![0].data), png);
      assert.ok(result.format.duration! > 0);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}

test('cover failure preserves audio and still writes the text tags', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'coco-tags-'));
  t.mock.method(globalThis, 'fetch', async () => new Response('not an image'));
  try {
    const file = path.join(dir, 'song.mp3');
    await copyFile(new URL('./fixtures/silence.mp3', import.meta.url), file);
    assert.match((await embedMetadata(file, 'mp3', { title: 'Song', artist: 'Artist', cover: 'https://example.test/missing' }))!, /封面/);
    assert.equal((await parseFile(file)).common.title, 'Song');
    const invalid = path.join(dir, 'invalid.flac');
    await writeFile(invalid, 'original bytes');
    assert.match((await embedMetadata(invalid, 'flac', { title: 'Song', artist: 'Artist' }))!, /原始音频已保留/);
    assert.equal(await readFile(invalid, 'utf8'), 'original bytes');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
