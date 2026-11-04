import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { catalog } from '../src/server/music/index';
import { artistDirectory } from '../src/server/music/artist-directory';
import { musicVideo } from '../src/server/music/mv';
import { GET as videoStream } from '../src/app/api/music/mv/stream/route';
import { inspectDownloadQualities } from '../src/server/local/download-quality';
import { validId } from '../src/server/music/ids';
import type { CatalogSource, SearchResult } from '../src/server/music/types';

// Read-only upstream checks. Never reads an existing login or changes a user's library.
if (!process.env.COCO_DATA_DIR) throw new Error('Set COCO_DATA_DIR to an isolated test directory');
const results: Array<{ source: string; endpoint: string; status: string; ms: number; detail?: string }> = [];
async function check<T>(source: CatalogSource, endpoint: string, call: () => Promise<T>, validate: (value: T) => void): Promise<T | undefined> {
  const start = Date.now();
  try {
    const value = await call(); validate(value);
    results.push({ source, endpoint, status: 'pass', ms: Date.now() - start });
    console.log(`PASS ${source} ${endpoint}`); return value;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ source, endpoint, status: 'fail', ms: Date.now() - start, detail });
    console.log(`FAIL ${source} ${endpoint}: ${detail}`);
  }
}
async function run(source: 'kugou' | 'kugou-lite') {
  const api = catalog(source);
  const items = (value: { items: Array<{ id: string; source: string }> }, kind: 'song' | 'playlist' | 'artist' | 'album') => {
    assert.ok(value.items.length, 'Expected non-empty items');
    for (const item of value.items) { assert.equal(item.source, source); assert.ok(validId(source, kind, item.id), `Invalid ${kind} ID ${item.id}`); }
  };
  const songs = await check(source, 'search/song', () => api.search('周杰伦', 'song', 0, 5), v => items(v, 'song'));
  await check(source, 'search/song/page2', () => api.search('周杰伦', 'song', 5, 5), v => { items(v, 'song'); assert.notEqual(v.items[0].id, songs?.items[0]?.id, 'Search repeated page 1'); });
  const album = await check(source, 'search/album', () => api.search('叶惠美', 'album', 0, 3), v => items(v, 'album'));
  const artists = await check(source, 'search/artist', () => api.search('周杰伦', 'artist', 0, 3), v => items(v, 'artist'));
  const lists = await check(source, 'search/playlist', () => api.search('华语', 'playlist', 0, 3), v => items(v, 'playlist'));
  await check(source, 'search/suggest', () => api.suggest('周杰伦'), v => assert.ok(v.keywords.length || v.songs.length, 'Empty suggestions'));
  await check(source, 'search/hot', () => api.searchDiscovery(), v => assert.ok(v.hot.length, 'Empty hot search'));
  await check(source, 'search/best', () => api.bestMatch('周杰伦'), v => assert.ok(v.artist, 'Missing best artist'));
  await check(source, 'home/featured', () => api.featured(), v => assert.ok(v.playlists.length && v.tracks.length && v.charts.length, 'Incomplete featured content'));
  await check(source, 'home/new', () => api.newReleases(), v => assert.ok(v.tracks.length && v.albums.length, 'Incomplete new releases'));
  await check(source, 'home/artists', () => api.artists(5), v => assert.ok(v.length, 'Empty artists'));
  const charts = await check(source, 'charts', () => api.charts(2), v => assert.ok(v.length && v.some(x => x.entries.length), 'Empty chart entries'));
  const categories = await check(source, 'categories', () => api.categories(), v => assert.ok(v.length, 'Empty categories'));
  const square = await check(source, 'playlists', () => api.playlists({ category: '', order: 'hot', limit: 5 }), v => items(v, 'playlist'));
  if (categories?.[0]?.options[0]) await check(source, 'playlists/filtered', () => api.playlists({ category: categories[0].options[0], order: 'quality', limit: 5 }), v => items(v, 'playlist'));
  if (square?.cursor) await check(source, 'playlists/page2', () => api.playlists({ category: '', order: 'hot', limit: 5, cursor: square.cursor }), v => items(v, 'playlist'));
  const playlist = square?.items[0] ?? lists?.items[0];
  if (playlist) await check(source, 'playlist/detail', () => api.playlistDetail(playlist.id, 0, 5), v => { assert.ok(v.info.name && v.tracks.length, 'Empty playlist'); assert.equal(v.info.source, source); });
  if (charts?.[0]) await check(source, 'chart/detail', () => api.playlistDetail(charts[0].id, 0, 5), v => assert.ok(v.tracks.length, 'Empty chart'));
  if (album?.items[0]) await check(source, 'album/detail', () => api.albumDetail(album.items[0].id), v => assert.ok(v.info.name && v.tracks.length, 'Empty album'));
  const artist = artists?.items[0]?.id ?? '3520';
  await check(source, 'artist/info', () => api.artistInfo(artist), v => { assert.ok(v.name); assert.equal(v.source, source); });
  await check(source, 'artist/biography', async () => (await api.artistInfo(artist)).description, v => assert.ok(v, 'Empty biography'));
  await check(source, 'artist/songs', () => api.artistSongs(artist, 0, 5), v => items(v, 'song'));
  await check(source, 'artist/albums', () => api.artistAlbums(artist, 0, 5), v => items(v, 'album'));
  await check(source, 'artists/directory', () => artistDirectory(source, { area: '', type: '', genre: '', initial: '', offset: 0, limit: 5 }), v => items(v, 'artist'));
  await check(source, 'artists/filtered', () => artistDirectory(source, { area: '1', type: '1', genre: '', initial: 'Z', offset: 0, limit: 5 }), v => items(v, 'artist'));
  const song = (songs as Extract<SearchResult, {type:'song'}> | undefined)?.items[0];
  if (song) {
    await check(source, 'song/lyrics', () => api.lyrics(song.id), v => assert.ok(v.lines.length, 'Empty lyrics'));
    await check(source, 'song/stats', () => api.songStats(song.id), v => assert.ok(typeof v.likeCount === 'number' || typeof v.commentCount === 'number', 'Missing song counts'));
    for (const sort of ['hot', 'latest', 'recommend'] as const) {
      const comments = await check(source, `song/comments/${sort}`, () => api.comments(song.id, sort, undefined, 5), v => assert.ok(v.items.length, 'Empty comments'));
      if (comments?.cursor) await check(source, `song/comments/${sort}/page2`, () => api.comments(song.id, sort, comments.cursor, 5), v => assert.ok(v.items.length, 'Empty comments page 2'));
    }
    const stream = await check(source, 'song/url', () => api.songSource(song.id, 'standard'), v => assert.ok(/^https?:/.test(v.url), 'Missing stream'));
    if (stream) await check(source, 'song/audio-bytes', () => probeAudio(stream.url), () => undefined);
    await check(source, 'download/qualities', () => inspectDownloadQualities(api, song.id), v => assert.ok(v.options.length && v.options.every(item => typeof item.available === 'boolean')));
    const download = await check(source, 'download/url', () => api.downloadSource!(song.id, 'standard'), v => assert.ok(/^https?:/.test(v.url), 'Missing download stream'));
    if (download) await check(source, 'download/audio-bytes', () => probeAudio(download.url), () => undefined);
    const mv = await check(source, 'mv', () => musicVideo(source, song.id), v => assert.ok(v.qualities.length, 'Missing MV'));
    if (mv) await check(source, 'mv/range-stream', async () => {
      const response = await videoStream(new Request(`http://127.0.0.1${mv.qualities[0].url}`, { headers: { Range: 'bytes=0-1023' } }));
      assert.equal(response.status, 206); assert.ok(response.headers.get('content-range'));
      const bytes = new Uint8Array(await response.arrayBuffer()); assert.equal(bytes.length, 1024);
    }, () => undefined);
  }
  await check(source, 'account/anonymous', () => api.account!.profile(), v => assert.equal(v, null));
  const qr = await check(source, 'account/qr', () => api.account!.qrCreate(), v => assert.ok(v.key && v.url, 'Missing QR'));
  if (qr) await check(source, 'account/qr-poll', () => api.account!.qrCheck(qr.key), v => assert.ok(v.status === 'waiting' || v.status === 'expired', 'Unexpected anonymous QR status'));
}
async function probeAudio(url: string) {
  const response = await fetch(url, { headers: { Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(15_000) });
  assert.ok(response.status === 200 || response.status === 206, `Audio HTTP ${response.status}`);
  assert.ok(/audio|octet-stream|ogg/i.test(response.headers.get('content-type') ?? ''), 'Not an audio response');
  const reader = response.body!.getReader();
  try { const first = await reader.read(); assert.ok(first.value?.length, 'Empty audio body'); }
  finally { await reader.cancel(); }
}
async function main() {
  for (const source of ['kugou', 'kugou-lite'] as const) await run(source);
  const report = { checkedAt: new Date().toISOString(), authenticated: false, results };
  await writeFile('docs/kugou-live-results.json', JSON.stringify(report, null, 2) + '\n');
  console.log(`Results: ${results.filter(x => x.status === 'pass').length}/${results.length} passed`);
  if (results.some(x => x.status === 'fail')) process.exitCode = 1;
}
void main();
