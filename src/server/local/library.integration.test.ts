import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { localToTrack } from '../../lib/local-client.ts';

test('concurrent scans and downloads preserve every entry, platform and trial flag', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'coco-library-'));
  const previous = process.env.COCO_DATA_DIR;
  process.env.COCO_DATA_DIR = dir;
  try {
    const oldFile = path.join(dir, 'legacy.wav');
    await copyFile(new URL('./fixtures/silence.wav', import.meta.url), oldFile);
    await writeFile(path.join(dir, 'library.json'), JSON.stringify({ folders: [], tracks: { legacy: { id: 'legacy', path: oldFile, title: '旧下载', artist: '歌手', remoteId: '123', addedAt: 0 } } }));
    await writeFile(path.join(dir, 'downloads.json'), JSON.stringify({ jobs: [{ localId: 'legacy', path: oldFile, source: 'kugou', trial: { start: 1, end: 2 } }] }));
    const library = await import('./library.ts');
    assert.equal(library.getTrack('legacy')?.source, 'kugou');
    assert.equal(library.getTrack('legacy')?.trial, true);
    await library.removeTrack('legacy');
    const folder = path.join(dir, 'music');
    await mkdir(folder);
    const a = path.join(folder, 'a.wav');
    const b = path.join(dir, 'b.wav');
    const c = path.join(dir, 'c.wav');
    for (const file of [a, b, c]) await copyFile(new URL('./fixtures/silence.wav', import.meta.url), file);
    await Promise.all([
      library.scanFolder(folder),
      library.addFiles([b], { remoteId: 'qq-id', source: 'qq', trial: true }),
      library.addFiles([c], { remoteId: 'kugou-id', source: 'kugou' }),
    ]);
    assert.equal(library.listLibrary().tracks.length, 3);
    const track = localToTrack(library.getTrack(library.trackId(b))!);
    assert.equal(track.source, 'qq');
    assert.equal(track.trialClip, true);
    assert.equal(track.songId, 'qq-id');
    await Promise.all([library.scanFolder(folder), library.removeTrack(library.trackId(c))]);
    assert.equal(library.listLibrary().tracks.length, 2);
    await library.removeFolder(folder);
    assert.deepEqual(library.listLibrary().tracks.map(item => item.path), [b]);
  } finally {
    if (previous === undefined) delete process.env.COCO_DATA_DIR; else process.env.COCO_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
