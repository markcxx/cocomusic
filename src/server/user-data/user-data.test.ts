import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Track } from '../../types/music.ts';
import { openDatabase } from '../db/database.ts';
import { SCHEMA_VERSION } from '../db/migrations.ts';
import { readDownloadJobs, readDownloadSettings, readLibraryFolders, readLibraryTrack } from '../local/rows.ts';
import { importRendererData, rendererImportPending } from './legacy.ts';
import { listRecentPlays, readPlayer, recordPlay, removeRecentPlays, saveQueue } from './listening.ts';
import { addTracks, createPlaylist, deletePlaylist, getPlaylist, listPlaylists, removeTracks, renamePlaylist } from './playlists.ts';
import { PLAYLIST_TRACK_LIMIT, RECENT_PLAYS_LIMIT } from './types.ts';

const track = (id: string, extra: Partial<Track> = {}): Track => ({ id, title: id, artist: 'A', coverSeed: id, ...extra });
const netease = (id: string, extra: Partial<Track> = {}) => track(`netease:${id}`, { songId: id, source: 'netease', ...extra });

function tempDir(t: TestContext) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'coco-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function freshDb(t: TestContext) {
  const db = openDatabase(path.join(tempDir(t), 'coco.db'));
  t.after(() => db.close());
  return db;
}

test('migration 1 imports library.json and downloads.json once and leaves them untouched', t => {
  const dir = tempDir(t);
  const library = { folders: ['/music'], tracks: { a: { id: 'a', path: '/music/a.mp3', title: 'A', artist: 'X', size: 1, mtime: 1, addedAt: 5, folder: '/music' }, old: { id: 'old', path: '/dl/old.mp3', title: '旧', artist: 'Y', size: 1, mtime: 1, addedAt: 1 } } };
  const downloads = {
    settings: { folder: '/dl', quality: 'lossless' },
    // Newest first, as the old list was kept; `old` predates the source field on library entries.
    jobs: [
      { id: 'j2', songId: '2', source: 'qq', title: 'Two', artist: 'Y', status: 'failed', received: 0, total: 0, createdAt: 20 },
      { id: 'j1', songId: '1', source: 'kugou', title: 'One', artist: 'Y', status: 'done', received: 1, total: 1, createdAt: 10, localId: 'old', path: '/dl/old.mp3', trial: { start: 0, end: 30 } },
      { id: 'broken', status: 'done' },
    ],
  };
  writeFileSync(path.join(dir, 'library.json'), JSON.stringify(library));
  writeFileSync(path.join(dir, 'downloads.json'), JSON.stringify(downloads));

  const db = openDatabase(path.join(dir, 'coco.db'));
  assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, SCHEMA_VERSION);
  assert.deepEqual(readLibraryFolders(db), ['/music']);
  assert.equal(readLibraryTrack(db, 'old')?.source, 'kugou');
  assert.equal(readLibraryTrack(db, 'old')?.trial, true);
  assert.deepEqual(readDownloadJobs(db).map(job => job.id), ['j2', 'j1']);
  assert.equal(readDownloadSettings(db)?.quality, 'lossless');
  db.close();

  // The old files stay as they were (an older version still reads them), and are never imported twice.
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'library.json'), 'utf8')), library);
  writeFileSync(path.join(dir, 'library.json'), JSON.stringify({ folders: ['/elsewhere'], tracks: {} }));
  const reopened = openDatabase(path.join(dir, 'coco.db'));
  t.after(() => reopened.close());
  assert.deepEqual(readLibraryFolders(reopened), ['/music']);
});

test('a failing migration leaves the database as it was and runs again next time', t => {
  const file = path.join(tempDir(t), 'coco.db');
  const blocker = new DatabaseSync(file);
  blocker.exec('CREATE TABLE kv (key TEXT)');
  blocker.close();
  assert.throws(() => openDatabase(file));
  const check = new DatabaseSync(file);
  assert.equal((check.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 0);
  assert.equal(check.prepare("SELECT name FROM sqlite_master WHERE name = 'playlists'").get(), undefined);
  check.exec('DROP TABLE kv');
  check.close();
  const db = openDatabase(file);
  t.after(() => db.close());
  assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, SCHEMA_VERSION);
});

test('local playlists mix platforms and local files, skip duplicates and stop at the limit', t => {
  const db = freshDb(t);
  const created = createPlaylist(db, { name: '  通勤路上  ', tracks: [netease('1', { cover: 'n1.jpg' }), track('qq:2', { source: 'qq', songId: '2' }), netease('1')] });
  assert.equal(created.name, '通勤路上');
  assert.equal(created.trackCount, 2);
  assert.equal(created.cover, 'n1.jpg');
  assert.equal(addTracks(db, created.id, [track('local:3', { localId: '3' }), track('qq:2')]), 1);
  removeTracks(db, created.id, ['netease:1']);
  assert.equal(renamePlaylist(db, created.id, '周末').name, '周末');
  const saved = getPlaylist(db, created.id);
  assert.deepEqual(saved.tracks.map(item => item.id), ['qq:2', 'local:3']);
  assert.equal(saved.cover, undefined);
  assert.throws(() => renamePlaylist(db, created.id, '   '), /歌单名称/);

  const full = createPlaylist(db, { name: '满', tracks: Array.from({ length: PLAYLIST_TRACK_LIMIT + 5 }, (_, index) => netease(String(index))) });
  assert.equal(full.trackCount, PLAYLIST_TRACK_LIMIT);
  assert.equal(addTracks(db, full.id, [netease('new')]), 0);
  assert.deepEqual(listPlaylists(db).map(item => item.id), [full.id, created.id]);

  deletePlaylist(db, created.id);
  assert.throws(() => getPlaylist(db, created.id), /不存在/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM playlist_tracks WHERE playlist_id = ?').get(created.id)?.n, 0);
});

test('recent plays count replays, keep the newest first and stay within the limit', t => {
  const db = freshDb(t);
  recordPlay(db, netease('1'), 1000);
  recordPlay(db, netease('2'), 2000);
  recordPlay(db, netease('1'), 3000);
  assert.deepEqual(listRecentPlays(db).map(item => [item.track.id, item.count]), [['netease:1', 2], ['netease:2', 1]]);
  for (let index = 0; index < RECENT_PLAYS_LIMIT + 5; index += 1) recordPlay(db, netease(`x${index}`), 10_000 + index);
  assert.equal(listRecentPlays(db).length, RECENT_PLAYS_LIMIT);
  removeRecentPlays(db, `netease:x${RECENT_PLAYS_LIMIT + 4}`);
  assert.equal(listRecentPlays(db)[0].track.id, `netease:x${RECENT_PLAYS_LIMIT + 3}`);
  removeRecentPlays(db);
  assert.deepEqual(listRecentPlays(db), []);
});

test('the saved queue drops songs that cannot play', t => {
  const db = freshDb(t);
  saveQueue(db, [netease('1'), track('placeholder')], 'netease:1');
  assert.deepEqual(readPlayer(db).queue.map(item => item.id), ['netease:1']);
  assert.equal(readPlayer(db).currentId, 'netease:1');
});

test('renderer data is handed over once; newer rows win and malformed entries are skipped', t => {
  const db = freshDb(t);
  saveQueue(db, [netease('kept')], 'netease:kept');
  recordPlay(db, netease('1'), 9000);
  assert.equal(rendererImportPending(db), true);
  importRendererData(db, {
    recentPlays: JSON.stringify([{ track: netease('1'), playedAt: 1, count: 7 }, { track: netease('2'), playedAt: 2, count: 3 }, { track: { id: 'broken' } }]),
    localPlaylists: JSON.stringify([
      { id: 'p1', name: '旧歌单', tracks: [netease('1'), { id: 'bad' }, track('local:9', { localId: '9' })], origin: { source: 'qq', id: '7' }, createdAt: 5, updatedAt: 6 },
      { id: 'nameless', tracks: [] },
    ]),
    queue: JSON.stringify({ queue: [netease('old')], currentId: 'netease:old' }),
    position: JSON.stringify({ id: 'netease:old', t: 42 }),
  });
  assert.equal(rendererImportPending(db), false);
  // The play recorded by the new version is not replaced by the older entry.
  assert.deepEqual(listRecentPlays(db).map(item => [item.track.id, item.count]), [['netease:1', 1], ['netease:2', 3]]);
  const imported = getPlaylist(db, 'p1');
  assert.deepEqual(imported.tracks.map(item => item.id), ['netease:1', 'local:9']);
  assert.deepEqual(imported.origin, { kind: 'playlist', source: 'qq', id: '7' });
  assert.deepEqual(listPlaylists(db).map(item => item.id), ['p1']);
  assert.deepEqual(readPlayer(db).queue.map(item => item.id), ['netease:kept']);
  assert.deepEqual(readPlayer(db).position, { id: 'netease:old', t: 42 });

  // A second hand-over (another window, a retry) changes nothing.
  importRendererData(db, { localPlaylists: JSON.stringify([{ id: 'p2', name: '又一个', tracks: [] }]) });
  assert.deepEqual(listPlaylists(db).map(item => item.id), ['p1']);
});
