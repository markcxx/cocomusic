import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import { neteaseProvider } from '../music/netease/provider.ts';
import { qqProvider } from '../music/qq/provider.ts';
import { localToTrack } from '../../lib/local-client.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWOQAAAAASUVORK5CYII=', 'base64');

test('song downloads default to audio only, embed artwork, preserve platforms, and allow lyric-only downloads', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'coco-downloads-'));
  const previous = process.env.COCO_DATA_DIR;
  process.env.COCO_DATA_DIR = dir;
  let lyricsCalls = 0;
  let audioCalls = 0;
  const audio = await readFile(new URL('./fixtures/silence.mp3', import.meta.url));
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  for (const provider of [neteaseProvider, qqProvider]) {
    const resolve = async (id: string, quality?: string) => {
      if (id === 'cancel') await delayed;
      return { id, url: 'https://example.test/song.mp3', level: id === 'downgrade' ? 'standard' : quality };
    };
    t.mock.method(provider, 'songSource', resolve);
    if (provider.downloadSource) t.mock.method(provider as { downloadSource: NonNullable<typeof provider.downloadSource> }, 'downloadSource', resolve);
    t.mock.method(provider, 'lyrics', async () => { lyricsCalls++; return { synced: true, lines: [{ time: 1, text: '测试歌词' }] }; });
  }
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    if (String(url).includes('cover')) return new Response(png);
    audioCalls++;
    return new Response(audio, { headers: { 'content-type': 'audio/mpeg', 'content-length': String(audio.length) } });
  });
  try {
    const downloads = await import('./downloads.ts');
    const library = await import('./library.ts');
    downloads.setFolder(path.join(dir, 'saved'));
    assert.equal(downloads.listDownloads().settings.lyrics, false);
    const tracks = [
      { id: '123', source: 'netease' as const, title: '网易歌曲', artist: '歌手', album: '专辑', cover: 'https://example.test/cover.png' },
      { id: '123', source: 'qq' as const, title: 'QQ歌曲', artist: '歌手', cover: 'https://example.test/cover.png' },
    ];
    assert.equal(downloads.enqueue(tracks).added, 2);
    const wait = async (predicate: () => boolean) => {
      const deadline = Date.now() + 5000;
      while (!predicate()) {
        if (Date.now() > deadline) throw new Error(JSON.stringify(downloads.listDownloads().jobs));
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    };
    await wait(() => downloads.listDownloads().jobs.every(job => job.status === 'done'));
    assert.equal(lyricsCalls, 0);
    assert.equal(audioCalls, 2);
    assert.ok(!(await readdir(path.join(dir, 'saved'))).some(name => name.endsWith('.lrc')));
    const jobs = downloads.listDownloads().jobs;
    for (const job of jobs) {
      const indexed = library.getTrack(job.localId!)!;
      assert.equal(localToTrack(indexed).source, job.source);
      assert.equal(indexed.hasCover, true);
      assert.equal((await parseFile(job.path!)).common.title, job.title);
    }
    const lyric = await downloads.downloadLyrics(tracks[1]);
    assert.match(await readFile(lyric.path, 'utf8'), /测试歌词/);
    assert.equal(lyric.path, jobs.find(job => job.source === 'qq')!.path!.replace(/\.mp3$/, '.lrc'));
    assert.equal(audioCalls, 2); // Explicit lyric download must never fetch audio.
    assert.equal(lyricsCalls, 1);
    const again = await downloads.downloadLyrics(tracks[1]);
    assert.notEqual(again.path, lyric.path);
    downloads.enqueue([{ id: 'cancel', source: 'netease', title: 'Cancel', artist: 'Artist' }]);
    const canceled = downloads.listDownloads().jobs.find(job => job.songId === 'cancel')!;
    downloads.cancel(canceled.id);
    release();
    await wait(() => downloads.listDownloads().jobs.find(job => job.id === canceled.id)?.status === 'canceled');
    assert.equal(audioCalls, 2);
    const options = { quality: 'lossless' as const, lyrics: false, allowTrial: false, allowFallback: false };
    downloads.enqueue([{ id: 'quality', source: 'qq', title: 'Quality', artist: 'Artist' }, { id: 'downgrade', source: 'qq', title: 'Downgrade', artist: 'Artist' }], options);
    downloads.updateSettings({ quality: 'standard', lyrics: true });
    await wait(() => downloads.listDownloads().jobs.filter(job => ['quality', 'downgrade'].includes(job.songId)).every(job => ['done', 'failed'].includes(job.status)));
    const selected = downloads.listDownloads().jobs.find(job => job.songId === 'quality')!;
    assert.equal(selected.level, 'lossless');
    assert.deepEqual(selected.options, options);
    const denied = downloads.listDownloads().jobs.find(job => job.songId === 'downgrade')!;
    assert.equal(denied.status, 'failed');
    assert.match(denied.error!, /重新选择音质/);
    assert.equal(lyricsCalls, 2); // Earlier lyric-only exports; new job keeps lyrics=false.
    assert.equal(audioCalls, 3); // Downgraded source must not be fetched.
    assert.equal(downloads.enqueue([{ id: 'quality', source: 'qq', title: 'Quality', artist: 'Artist' }], options).added, 0);
    assert.equal(downloads.enqueue([{ id: 'quality', source: 'qq', title: 'Quality', artist: 'Artist' }], { ...options, quality: 'exhigh' }).added, 1);
    await wait(() => downloads.listDownloads().jobs.find(job => job.songId === 'quality')?.status === 'done');
    assert.equal(audioCalls, 4);
    assert.equal(downloads.listDownloads().jobs.find(job => job.songId === 'quality')?.level, 'exhigh');
    const qqJob = jobs.find(job => job.source === 'qq')!;
    await downloads.removeJob(qqJob.id, true);
    assert.equal(library.getTrack(qqJob.localId!), undefined);
  } finally {
    release();
    if (previous === undefined) delete process.env.COCO_DATA_DIR; else process.env.COCO_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
