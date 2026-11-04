import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import type { KugouClient } from './client';

const directory = mkdtempSync(path.join(os.tmpdir(), 'coco-kugou-'));
process.env.COCO_DATA_DIR = directory;
// Provider protocol tests start with an already registered installation.
// Registration lifecycle and encryption are covered separately in device tests.
writeFileSync(path.join(directory, 'kugou-device.json'), JSON.stringify({ guid: 'test-guid', mid: 'saved-device', dfid: 'test-dfid', registeredAt: 1 }));
after(() => rmSync(directory, { recursive: true, force: true }));
const require = createRequire(import.meta.url);
const { session } = require('../session') as typeof import('../session');
const { createKugouClient } = require('./client') as typeof import('./client');
const { createKugouMappers } = require('./mappers') as typeof import('./mappers');
const { createKugouProvider } = require('./provider') as typeof import('./provider');
const { createKugouAccount } = require('./account') as typeof import('./account');
const { createKugouPlayback } = require('./playback') as typeof import('./playback');
const { createKugouCatalog } = require('./catalog') as typeof import('./catalog');
const hash = 'b3a52a7a958bf0aed0ebfba2e9a818b7';
const key = `${hash}.966846.32100650`;

test('normal and concept requests keep signatures, tokens and identities isolated under concurrency', async t => {
  t.after(() => { session.clear('kugou'); session.clear('kugou-lite'); });
  session.set('kugou', { userid: '101', token: 'normal-token', dfid: 'normal-device' });
  session.set('kugou-lite', { userid: '202', token: 'lite-token', dfid: 'lite-device' });
  const normal = createKugouClient('kugou');
  const lite = createKugouClient('kugou-lite');
  const seen: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => { seen.push(new URL(input)); await new Promise(resolve => setImmediate(resolve)); return Response.json({ status: 1, data: {} }); });
  await Promise.all([normal.kugouRequest({ path: '/test' }), lite.kugouRequest({ path: '/test' }), normal.kugouRequest({ path: '/test' })]);
  assert.deepEqual(seen.map(x => [x.searchParams.get('appid'), x.searchParams.get('userid'), x.searchParams.get('token')]).sort(), [['1005', '101', 'normal-token'], ['3116', '202', 'lite-token'], ['1005', '101', 'normal-token']].sort());
  for (const url of seen) {
    const params = Object.fromEntries(url.searchParams);
    const signature = params.signature; delete params.signature;
    const client = params.appid === '3116' ? lite : normal;
    assert.equal(signature, client.androidSign(params));
  }
  assert.notEqual(normal.songKey(hash, 'device', '1'), lite.songKey(hash, 'device', '1'));
  assert.notEqual(normal.paramsKey(1234), lite.paramsKey(1234));
  assert.notEqual(normal.androidSign({ a: 1 }), lite.androidSign({ a: 1 }));
  await createKugouProvider('kugou-lite').account!.logout();
  assert.equal(session.get('kugou')!.cookie.token, 'normal-token');
  assert.equal(session.get('kugou-lite'), undefined);
  session.clear('kugou');
});

test('concept catalog maps every entity and nested song to its own source', () => {
  const map = createKugouMappers('kugou-lite');
  assert.equal(map.mapSearchSong({ FileHash: hash, AlbumID: 1, MixSongID: 2, SongName: '歌曲' }).source, 'kugou-lite');
  assert.equal(map.mapRichSong({ hash, songname: '歌曲' }).source, 'kugou-lite');
  assert.equal(map.mapListSong({ hash, name: '歌曲' }).source, 'kugou-lite');
  assert.equal(map.mapAlbum({ albumid: 1 }).source, 'kugou-lite');
  assert.equal(map.mapArtist({ singerid: 1 }).source, 'kugou-lite');
  assert.equal(map.mapPlaylist({ global_collection_id: 'collection_1_2' }).source, 'kugou-lite');
});

test('concept playback uses its parameters; downloads use separate rights and retain preview markers', async t => {
  const requests: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input); requests.push(url);
    return Response.json({ status: 1, url: ['https://media.test/song.ogg'], hash_offset: url.searchParams.get('IsFreePart') === '1' ? { file_type: 0, start_ms: 30000, end_ms: 90000 } : {} });
  });
  const playback = createKugouPlayback(createKugouClient('kugou-lite'));
  await playback.songSource(key, 'standard');
  await playback.downloadSource(key, 'standard');
  assert.equal(requests[0].searchParams.get('pid'), '411');
  assert.equal(requests[0].searchParams.get('page_id'), '967177915');
  assert.equal(requests[0].searchParams.get('need_ogg'), '1');
  assert.equal(requests[0].searchParams.get('behavior'), 'play');
  assert.equal(requests[1].searchParams.get('behavior'), 'download');
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const trial = new URL(input).searchParams.get('IsFreePart') === '1';
    return Response.json(trial ? { status: 1, url: ['https://media.test/clip.mp3'], hash_offset: { file_type: 0, start_ms: 30000, end_ms: 90000 } } : { status: 1, url: [], fail_process: [1] });
  });
  assert.deepEqual((await playback.songSource(key, 'standard')).trial, { start: 30, end: 90 });
});

test('logged-in concept playback obtains user and song authorization before resolving the stream', async t => {
  session.set('kugou-lite', { userid: '202', token: 'lite-token' });
  t.after(() => session.clear('kugou-lite'));
  const seen: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input); seen.push(url);
    if (url.pathname === '/v2/get_res_privilege/lite') return Response.json({ status: 1, data: [{ album_id: 966846, album_audio_id: 32100650, relate_goods: [{ quality: 'flac', status: 1, hash }] }] });
    if (url.pathname === '/v1/user_verify') return Response.json({ status: 1, data: { auth: 'user-auth' } });
    if (url.pathname === '/v1/authorization') { assert.equal(url.searchParams.get('authorization'), 'user-auth'); return Response.json({ status: 1, data: { auth: 'song-auth', open_time: 123 } }); }
    assert.equal(new Headers(init?.headers).get('x-router'), null, 'Authorized tracker must use gateway routing, not the legacy CDN router');
    assert.equal(url.searchParams.has('IsFreePart'), false);
    assert.equal(url.searchParams.has('kcard'), false);
    assert.equal(url.searchParams.get('uuid'), '-');
    return Response.json({ status: 1, url: ['https://media.test/song.flac'] });
  });
  await createKugouPlayback(createKugouClient('kugou-lite')).songSource(key, 'lossless');
  assert.deepEqual(seen.map(x => x.pathname), ['/v2/get_res_privilege/lite', '/v1/user_verify', '/v1/authorization', '/tracker/v5/url']);
  assert.equal(seen[3].searchParams.get('auth'), 'song-auth');
  assert.equal(seen[3].searchParams.get('open_time'), '123');
  session.clear('kugou-lite');
});

test('concept QR confirms into only the concept session and logout leaves normal login intact', async t => {
  session.set('kugou', { userid: '101', token: 'normal' });
  session.set('kugou-lite', { userid: '303', token: 'previous-login', KUGOU_API_MID: 'previous-mid', dfid: 'previous-dfid' });
  t.mock.method(globalThis, 'fetch', async (input: string, init: RequestInit) => {
    const url = new URL(input);
    if (url.pathname === '/v2/qrcode' || url.pathname === '/v2/get_userinfo_qrcode') {
      assert.equal(url.searchParams.has('token'), false);
      assert.equal(url.searchParams.get('mid'), 'saved-device');
    }
    if (url.pathname === '/v2/qrcode') { assert.ok(url.searchParams.get('qrcode_txt')!.includes('appid=3116')); return Response.json({ status: 1, data: { qrcode: 'test-qr' } }); }
    if (url.pathname === '/v2/get_userinfo_qrcode') { assert.equal(url.searchParams.get('appid'), '3116'); return Response.json({ status: 1, data: { status: 4, userid: 202, token: 'concept', t1: 'session-t1', expires: 3600 } }); }
    const body = JSON.parse(String(init.body));
    assert.equal(body.p.length, 256);
    return Response.json({ status: 1, data: { nickname: '概念用户' } });
  });
  const account = createKugouProvider('kugou-lite').account!;
  assert.ok((await account.qrCreate()).url.includes('appid=3116'));
  assert.equal((await account.qrCheck('test-qr')).status, 'success');
  assert.equal((await account.profile())!.source, 'kugou-lite');
  assert.equal(session.get('kugou-lite')!.cookie.token, 'concept');
  assert.equal(session.get('kugou-lite')!.cookie.t1, 'session-t1');
  assert.equal(session.get('kugou-lite')!.cookie.expires, '3600');
  assert.equal(session.get('kugou-lite')!.cookie.KUGOU_API_MID, 'saved-device');
  assert.equal(session.get('kugou-lite')!.cookie.dfid, 'test-dfid');
  assert.equal(session.get('kugou')!.cookie.token, 'normal');
  await account.logout(); session.clear('kugou');
});

test('concept account supports likes, list edits, subscription and encrypted rename without using normal login', async () => {
  session.set('kugou-lite', { userid: '202', token: 'concept' });
  const seen: Array<{ path: string; data: unknown }> = [];
  const lists = [{ listid: 2, name: '我喜欢', is_def: 2, global_collection_id: 'collection_2_2', list_create_userid: 202 }, { listid: 3, name: '测试', global_collection_id: 'collection_3_3', list_create_userid: 202 }];
  const base = createKugouClient('kugou-lite');
  const client: KugouClient = { ...base, kugouRequest: (async (options: Parameters<KugouClient['kugouRequest']>[0]) => {
    seen.push({ path: options.path, data: options.data });
    if (options.path === '/v7/get_all_list') return { status: 1, data: { info: lists, total_ver: 2 } };
    if (options.path === '/v4/get_list_all_file_v3') return { status: 1, data: { info: [{ hash, album_id: 966846, mixsongid: 32100650, fileid: 9 }], count: 1 } };
    if (options.path === '/v3/get_list_info') return { status: 1, data: [{ name: '收藏', list_create_userid: 999, list_create_listid: 4, global_collection_id: 'collection_9_4' }] };
    if (options.path === '/v1/modify_list') { assert.ok(Buffer.isBuffer(options.data)); return Buffer.from('{"status":1}'); }
    if (options.path === '/v2/delete_list') return Buffer.from('corrupt-response');
    if (options.path.includes('/add_list') && (options.data as { type: number }).type === 0) { lists.push({ listid: 5, name: '新歌单', global_collection_id: 'collection_5_5', list_create_userid: 202 }); return { status: 1, data: { listid: 5 } }; }
    return { status: 1 };
  }) as KugouClient['kugouRequest'] };
  const account = createKugouAccount(client).kugouAccount;
  assert.equal((await account.userPlaylists())[0].source, 'kugou-lite');
  assert.deepEqual(await account.likedIds(), [key]);
  await account.likeSong(key, true); await account.likeSong(key, false);
  await account.editPlaylistTracks('collection_3_3', [key], 'add');
  await account.editPlaylistTracks('collection_3_3', [key], 'del');
  await account.subscribePlaylist('collection_9_4', true);
  assert.equal((await account.createPlaylist('新歌单', 'private')).source, 'kugou-lite');
  await account.renamePlaylist('collection_3_3', '改名');
  await assert.rejects(account.deletePlaylist('collection_3_3'), /无法解密/);
  assert.ok(seen.some(x => x.path === '/cloudlist.service/v6/add_song'));
  assert.ok(seen.some(x => x.path === '/v4/delete_songs'));
  const payload = seen.find(x => x.path === '/cloudlist.service/v6/add_song')!.data as { userid: number; token: string };
  assert.equal(payload.userid, 202); assert.equal(payload.token, 'concept');
  session.clear('kugou-lite');
});

test('membership routes reject other platforms and anonymous claims; activity dates use China time', async () => {
  const { GET, POST } = require('../../../app/api/account/membership/route') as typeof import('../../../app/api/account/membership/route');
  assert.equal((await GET(new Request('http://localhost/api/account/membership?source=kugou'))).status, 400);
  assert.equal((await POST(new Request('http://localhost/api/account/membership?source=kugou-lite'))).status, 401);
  const { conceptToday } = require('./membership') as typeof import('./membership');
  assert.equal(conceptToday(new Date('2026-11-04T16:01:00Z')), '2026-11-05');
});

test('stream signatures are independently reproducible from the concept protocol', () => {
  const value = createKugouClient('kugou-lite').songKey(hash, 'device', '202');
  assert.equal(value, createHash('md5').update(`${hash}185672dd44712f60bb1736df5a377e823116device202`).digest('hex'));
});

test('silent quality fallback and previews returned to a full-stream request are never called lossless/full', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 1, url: ['https://media.test/clip.mp3'], bitRate: 128000, extName: 'mp3', hash_offset: { file_type: 0, start_ms: 12500, end_ms: 72500 } }));
  const source = await createKugouPlayback(createKugouClient('kugou-lite')).songSource(key, 'lossless');
  assert.equal(source.level, 'standard');
  assert.deepEqual(source.trial, { start: 12.5, end: 72.5 });
});

test('membership coalesces concurrent claims, sends only today and re-reads platform state', async t => {
  session.set('kugou-lite', { userid: '202', token: 'concept' });
  const seen: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input); seen.push(url);
    if (url.pathname.includes('receive_vip')) { await new Promise(resolve => setImmediate(resolve)); return Response.json({ status: 1 }); }
    if (url.pathname.includes('get_union_vip')) return Response.json({ status: 1, data: { vip_type: 1, vip_end_time: '2026-11-05' } });
    return Response.json({ status: 1, data: { records: [{ receive_day: '2026-11-04', status: 1 }] } });
  });
  const { claimConceptMembership, conceptToday } = require('./membership') as typeof import('./membership');
  const [first, second] = await Promise.all([claimConceptMembership(), claimConceptMembership()]);
  assert.deepEqual(first, second); assert.equal(first.vipType, 1);
  assert.equal(seen.filter(x => x.pathname.includes('receive_vip')).length, 1);
  assert.equal(seen.find(x => x.pathname.includes('receive_vip'))!.searchParams.get('receive_day'), conceptToday());
  assert.equal(first.records[0].date, '2026-11-04');
  session.clear('kugou-lite');
});

test('membership refuses ambiguous success responses instead of claiming benefits were granted', async t => {
  session.set('kugou-lite', { userid: '202', token: 'concept' });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: {} }));
  const { claimConceptMembership } = require('./membership') as typeof import('./membership');
  await assert.rejects(claimConceptMembership(), /平台未确认领取成功/);
  session.clear('kugou-lite');
});

test('HTTP-only signed CDN URLs are preserved without turning TLS verification off', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 1, url: ['http://fs.youthandroid2.kugou.com/audio'], bitRate: 128000, extName: 'mp3' }));
  assert.equal((await createKugouPlayback(createKugouClient('kugou-lite')).songSource(key, 'standard')).url, 'http://fs.youthandroid2.kugou.com/audio');
});

test('personal playlists use authenticated cloud files rather than public shield placeholders', async () => {
  const base = createKugouClient('kugou-lite');
  const paths: string[] = [];
  const client: KugouClient = { ...base, device: () => ({ dfid: '-', mid: 'device', uuid: '-', userid: '202', token: 'concept' }), kugouRequest: (async (options: Parameters<KugouClient['kugouRequest']>[0]) => {
    paths.push(options.path);
    if (options.path === '/v3/get_list_info') return { status: 1, data: [{ name: '我的歌单', count: 1, list_create_userid: 202, list_create_listid: 17 }] };
    assert.equal(options.path, '/v4/get_list_all_file_v3');
    assert.equal((options.data as { listid: number }).listid, 17);
    return { status: 1, data: { count: 1, info: [{ hash, album_id: 966846, mixsongid: 32100650, name: '周杰伦 - 晴天.mp3' }] } };
  }) as KugouClient['kugouRequest'] };
  const detail = await createKugouCatalog(client).playlistDetail('collection_3_202_17_0', 0, 50);
  assert.deepEqual(paths, ['/v3/get_list_info', '/v4/get_list_all_file_v3']);
  assert.equal(detail.tracks[0].id, key); assert.equal(detail.tracks[0].title, '晴天');
  const { isPlayable } = require('../../../types/music') as typeof import('../../../types/music');
  assert.equal(isPlayable({ songId: '..', source: 'kugou-lite' } as import('../../../types/music').Track), false);
});

test('security verification is preserved as 403/code 20028, never retried as a missing song', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ status: 0, errcode: 20028, error: '本次请求需要验证' }); });
  await assert.rejects(createKugouPlayback(createKugouClient('kugou-lite')).songSource(key, 'lossless'), (error: unknown) => {
    const value = error as { status: number; code: number };
    return value.status === 403 && value.code === 20028;
  });
  assert.equal(calls, 1);
});

test('signed-in concept playback selects the available Ogg resource and refreshed album identity', async t => {
  session.set('kugou-lite', { userid: '202', token: 'concept', KUGOU_API_MID: 'saved-device' });
  t.after(() => session.clear('kugou-lite'));
  const oggHash = '11111111111111111111111111111111';
  const seen: URL[] = [];
  const client = createKugouClient('kugou-lite');
  t.mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input); seen.push(url);
    assert.equal(url.searchParams.get('mid'), 'saved-device');
    if (url.pathname === '/v2/get_res_privilege/lite') {
      const data = JSON.parse(String(init?.body));
      assert.equal('album_audio_id' in data.resource[0], false);
      return Response.json({ status: 1, data: [{ album_id: 77, album_audio_id: 88, trans_param: { ogg_128_hash: oggHash }, relate_goods: [{ quality: '320', status: 0, privilege: 10 }, { quality: '128', status: 1, hash }] }] });
    }
    if (url.pathname === '/v1/user_verify') return Response.json({ status: 1, data: { auth: 'user-auth' } });
    if (url.pathname === '/v1/authorization') return Response.json({ status: 1, data: { auth: 'song-auth', open_time: 123 } });
    assert.equal(url.pathname, '/tracker/v5/url');
    assert.equal(url.searchParams.get('quality'), '128');
    assert.equal(url.searchParams.get('hash'), oggHash);
    assert.equal(url.searchParams.get('album_id'), '77');
    assert.equal(url.searchParams.get('album_audio_id'), '88');
    assert.equal(url.searchParams.get('key'), client.songKey(oggHash, 'saved-device', '202'));
    return Response.json({ status: 1, url: ['https://media.test/full.ogg'], bitRate: 128000, extName: 'ogg' });
  });
  const result = await createKugouPlayback(client).songSource(key, 'exhigh');
  assert.equal(result.id, key);
  assert.equal(result.level, 'standard');
  assert.equal(seen.filter(url => url.pathname === '/tracker/v5/url').length, 1);
});

test('missing user authorization stops before song authorization or stream calls', async t => {
  session.set('kugou-lite', { userid: '202', token: 'concept' });
  t.after(() => session.clear('kugou-lite'));
  const paths: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input); paths.push(url.pathname);
    return Response.json(url.pathname === '/v2/get_res_privilege/lite'
      ? { status: 1, data: [{ relate_goods: [{ quality: '128', status: 1, hash }] }] }
      : { status: 1, data: {} });
  });
  await assert.rejects(createKugouPlayback(createKugouClient('kugou-lite')).songSource(key, 'standard'), /未返回用户播放授权/);
  assert.deepEqual(paths, ['/v2/get_res_privilege/lite', '/v1/user_verify']);
});

test('concept standard free listening reaches authenticated tracker despite generic VIP privilege restrictions', async t => {
  session.set('kugou-lite', { userid: '202', token: 'concept' });
  t.after(() => session.clear('kugou-lite'));
  const paths: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input); paths.push(url.pathname);
    if (url.pathname === '/v2/get_res_privilege/lite') return Response.json({ status: 1, data: [{ relate_goods: [{ quality: '320', status: 0, privilege: 10 }, { quality: '128', status: 0, privilege: 10, hash }] }] });
    if (url.pathname === '/v1/user_verify') return Response.json({ status: 1, data: { auth: 'user-auth' } });
    if (url.pathname === '/v1/authorization') return Response.json({ status: 1, data: { auth: 'song-auth', open_time: 123 } });
    assert.equal(url.pathname, '/tracker/v5/url');
    assert.equal(url.searchParams.get('quality'), '128');
    return Response.json({ status: 1, url: ['https://media.test/full.ogg'], bitRate: 96000, extName: 'ogg' });
  });
  assert.equal((await createKugouPlayback(createKugouClient('kugou-lite')).songSource(key, 'exhigh')).trial, undefined);
  assert.equal(paths.filter(path => path === '/tracker/v5/url').length, 1);
});

test('authentication rejection propagates for library requests but does not destroy saved credentials or force QR login', async t => {
  session.set('kugou-lite', { userid: '202', token: 'expired-token' }, { id: '202', source: 'kugou-lite', nickname: 'cached-name' });
  t.after(() => session.clear('kugou-lite'));
  t.mock.method(globalThis, 'fetch', async (input: string) => Response.json({ status: 0, error_code: new URL(input).pathname === '/v3/get_my_info' ? 20018 : 20017 }));
  const account = createKugouAccount(createKugouClient('kugou-lite')).kugouAccount;
  const rejected = (error: unknown) => (error as { status: number }).status === 401;
  await assert.rejects(account.userPlaylists(), rejected);
  await assert.rejects(account.likedIds(), rejected);
  await assert.rejects(account.detail(), rejected);
  assert.equal((await account.profile())?.nickname, 'cached-name');
  assert.equal(session.get('kugou-lite')?.cookie.token, 'expired-token');
  assert.equal(session.takeExpired('kugou-lite'), false);
});

test('unrelated service error 20017 remains a service error and does not expire the login', async t => {
  session.set('kugou-lite', { userid: '202', token: 'valid-token' });
  t.after(() => session.clear('kugou-lite'));
  t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 0, error_code: 20017, error_msg: 'params invalid' }));
  await assert.rejects(createKugouClient('kugou-lite').kugouRequest({ path: '/unrelated' }), (error: unknown) => (error as { status: number }).status === 502);
  assert.equal(session.get('kugou-lite')?.cookie.token, 'valid-token');
});

test('authenticated requests retain their login device; anonymous QR requests use only the installation identity', async t => {
  session.set('kugou-lite', { userid: '202', token: 'bound-token', KUGOU_API_MID: 'bound-mid', dfid: 'bound-dfid' });
  t.after(() => session.clear('kugou-lite'));
  const client = createKugouClient('kugou-lite');
  const seen: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input); seen.push(url);
    assert.equal(new Headers(init?.headers).get('mid'), url.searchParams.get('mid'));
    assert.equal(new Headers(init?.headers).get('dfid'), url.searchParams.get('dfid'));
    return Response.json({ status: 1 });
  });
  await client.kugouRequest({ path: '/signed-in' });
  await client.kugouRequest({ path: '/qr', anonymous: true });
  assert.equal(seen[0].searchParams.get('mid'), 'bound-mid');
  assert.equal(seen[0].searchParams.get('dfid'), 'bound-dfid');
  assert.equal(seen[0].searchParams.get('token'), 'bound-token');
  assert.equal(seen[1].searchParams.get('mid'), 'saved-device');
  assert.equal(seen[1].searchParams.get('dfid'), 'test-dfid');
  assert.equal(seen[1].searchParams.has('token'), false);
  assert.equal(seen[1].searchParams.get('userid'), '0');
});

test('a delayed authentication failure cannot clear or replace a newer QR login', async t => {
  session.set('kugou-lite', { userid: '202', token: 'old-token' }, { id: '202', source: 'kugou-lite', nickname: 'old-profile' });
  t.after(() => session.clear('kugou-lite'));
  let finish!: (value: Response) => void;
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  t.mock.method(globalThis, 'fetch', () => { started(); return new Promise<Response>(resolve => { finish = resolve; }); });
  const pending = createKugouAccount(createKugouClient('kugou-lite')).kugouAccount.profile();
  await ready;
  session.set('kugou-lite', { userid: '202', token: 'new-token' }, { id: '202', source: 'kugou-lite', nickname: 'new-profile' });
  finish(Response.json({ status: 0, error_code: 20018 }));
  assert.equal((await pending)?.nickname, 'new-profile');
  assert.equal(session.get('kugou-lite')?.cookie.token, 'new-token');
  assert.equal(session.takeExpired('kugou-lite'), false);
});
