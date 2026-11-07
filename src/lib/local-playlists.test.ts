import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Track } from '@/types/music';
import { LOCAL_PLAYLIST_TRACK_LIMIT, localPlaylistCover, localPlaylists, mergeTracks, parseLocalPlaylists } from './local-playlists';

const track = (id: string, extra: Partial<Track> = {}): Track => ({ id, title: id, artist: 'A', coverSeed: id, ...extra });

test('merging keeps order, skips songs already listed and stops at the limit', () => {
  const merged = mergeTracks([track('netease:1')], [track('qq:2'), track('netease:1'), track('local:3'), track('qq:2')]);
  assert.deepEqual(merged.tracks.map(item => item.id), ['netease:1', 'qq:2', 'local:3']);
  assert.equal(merged.added, 2);

  const full = Array.from({ length: LOCAL_PLAYLIST_TRACK_LIMIT }, (_, index) => track(`netease:${index}`));
  assert.equal(mergeTracks(full, [track('qq:new')]).added, 0);
});

test('stored data is validated: malformed playlists and songs are dropped', () => {
  const raw = JSON.stringify([
    { id: 'a', name: '混合', tracks: [track('netease:1'), { id: 'broken' }, null], createdAt: 1, updatedAt: 1 },
    { id: 'b', tracks: [] },
    'nonsense',
  ]);
  const parsed = parseLocalPlaylists(raw);
  assert.deepEqual(parsed.map(item => item.id), ['a']);
  assert.deepEqual(parsed[0].tracks.map(item => item.id), ['netease:1']);
  assert.deepEqual(parseLocalPlaylists('{not json'), []);
  assert.deepEqual(parseLocalPlaylists(null), []);
});

test('the cover is the imported artwork, else the first song with one', () => {
  const base = { id: 'p', name: 'p', createdAt: 0, updatedAt: 0 };
  assert.equal(localPlaylistCover({ ...base, tracks: [track('a'), track('b', { cover: 'b.jpg' })] }), 'b.jpg');
  assert.equal(localPlaylistCover({ ...base, cover: 'own.jpg', tracks: [track('b', { cover: 'b.jpg' })] }), 'own.jpg');
});

test('playlists mix platforms and local files; edits keep the list consistent', () => {
  const created = localPlaylists.create({ name: '  通勤路上  ', tracks: [track('netease:1'), track('qq:2')] });
  assert.equal(created.name, '通勤路上');
  assert.equal(localPlaylists.addTracks(created.id, [track('local:3'), track('qq:2')]), 1);
  localPlaylists.removeTracks(created.id, ['netease:1']);
  localPlaylists.rename(created.id, '周末');
  const saved = localPlaylists.get(created.id);
  assert.equal(saved?.name, '周末');
  assert.deepEqual(saved?.tracks.map(item => item.id), ['qq:2', 'local:3']);
  assert.throws(() => localPlaylists.rename(created.id, '   '), /歌单名称/);
  localPlaylists.remove(created.id);
  assert.equal(localPlaylists.get(created.id), undefined);
  assert.throws(() => localPlaylists.addTracks(created.id, [track('qq:9')]), /不存在/);
});
