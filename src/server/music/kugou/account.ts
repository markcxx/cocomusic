import { constants, createCipheriv, createDecipheriv, publicEncrypt, randomBytes } from 'node:crypto';
import { session } from '../session';
import type { AccountProvider, UserDetail, UserPlaylist, UserProfile } from '../types';
import { APPID, CLIENTVER, device, KugouError, kugouRequest, md5, paramsKey } from './client';
import { image, num, record, rows, splitSongKey, SOURCE, text, type Raw } from './mappers';

// Endpoints follow KugouMusicAPI module/login_qr_*, user_detail, user_playlist,
// playlist_add/del, playlist_tracks_add/del, playlist_track_all_new.

const LOGIN_BASE = 'https://login-user.kugou.com';
const SRCAPPID = 2919;
/** Kugou's public key (KugouMusicAPI util/crypto.js publicRasKey). */
const PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDIAG7QOELSYoIJvTFJhMpe1s/gbjDJX51HBNnEl5HXqTW6lQ7LC8jr9fWZTwusknp+sVGzwd40MwP6U5yDE27M/X1+UR4tvOGOqp94TJtQ1EPnWGWXngpeIW5GxoQGao1rmYWAu6oi1z9XkChrsUdC6DJE5E221wf/4WLFxwAtRQIDAQAB\n-----END PUBLIC KEY-----';

/** RSA without padding over a zero-filled 128-byte block (user_detail `p`). */
const rsaRaw = (data: unknown) => {
  const buffer = Buffer.from(JSON.stringify(data));
  return publicEncrypt({ key: PUBLIC_KEY, padding: constants.RSA_NO_PADDING }, Buffer.concat([buffer, Buffer.alloc(128 - buffer.length)])).toString('hex').toUpperCase();
};
const rsaPkcs1 = (data: unknown) => publicEncrypt({ key: PUBLIC_KEY, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(JSON.stringify(data))).toString('hex').toUpperCase();

/** cloudlist AES-128-CBC with a 6-char key: key/iv = md5(key) halves. */
const RANDOM_CHARS = '1234567890abcdefghijklmnopqrstuvwxyz';
function playlistAes(data: unknown) {
  const key = Array.from(randomBytes(6), byte => RANDOM_CHARS[byte % RANDOM_CHARS.length]).join('');
  const hash = md5(key);
  const cipher = createCipheriv('aes-128-cbc', hash.slice(0, 16), hash.slice(16, 32));
  return { key, body: Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]).toString('base64') };
}
function playlistAesDecrypt(bytes: Buffer, key: string): Raw {
  const hash = md5(key);
  const decipher = createDecipheriv('aes-128-cbc', hash.slice(0, 16), hash.slice(16, 32));
  try { return record(JSON.parse(Buffer.concat([decipher.update(bytes), decipher.final()]).toString('utf8'))); } catch { return {}; }
}

function current() {
  const value = session.get('kugou');
  if (!value?.cookie.token || !value.cookie.userid) throw new KugouError('请先登录酷狗音乐账号', 401);
  return { userid: value.cookie.userid, token: value.cookie.token, profile: value.profile };
}

async function myInfo(userid: string, token: string) {
  const clienttime = Math.floor(Date.now() / 1000);
  const json = await kugouRequest<Raw>({
    method: 'POST', path: '/v3/get_my_info', router: 'usercenter.kugou.com', params: { plat: 1 },
    data: { visit_time: clienttime, usertype: 1, p: rsaRaw({ token, clienttime }), userid: Number(userid) },
  });
  return record(json.data);
}

const toProfile = (userid: string, info: Raw): UserProfile | null => (text(info.nickname)
  ? { id: userid, source: SOURCE, nickname: text(info.nickname), avatar: image(info.pic, 240), vipType: num(info.vip_type) ?? 0 }
  : null);

/* ───────── Playlists ───────── */

type OwnList = { listid: number; gid: string; name: string; cover?: string; count?: number; own: boolean; liked: boolean; createUserId: string; isPrivate: boolean };

async function allLists(userid: string, token: string): Promise<OwnList[]> {
  const json = await kugouRequest<Raw>({
    method: 'POST', path: '/v7/get_all_list', router: 'cloudlist.service.kugou.com', params: { plat: 1, userid: Number(userid), token },
    data: { userid: Number(userid), token, total_ver: 979, type: 2, page: 1, pagesize: 100 },
  });
  return rows(record(json.data).info).map(item => {
    const name = text(item.name);
    const createUserId = text(item.list_create_userid);
    return {
      listid: Number(item.listid),
      gid: text(item.global_collection_id ?? item.list_create_gid),
      name,
      cover: image(item.pic, 400),
      count: num(item.count),
      own: !createUserId || createUserId === userid,
      // "我喜欢" is the default favourites list (listid 2 / is_def 2 upstream).
      liked: name === '我喜欢' || Number(item.is_def) === 2,
      createUserId,
      isPrivate: Number(item.is_pri) === 1,
    };
  });
}

async function listByGid(userid: string, token: string, gid: string) {
  const list = (await allLists(userid, token)).find(item => item.gid === gid || String(item.listid) === gid);
  if (!list) throw new KugouError('歌单不在你的账号中', 404);
  return list;
}

/** Files of one of the user's lists (each carries its per-list `fileid`). */
async function listFiles(userid: string, token: string, listid: number) {
  const files: Raw[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const json = await kugouRequest<Raw>({
      method: 'POST', path: '/v4/get_list_all_file', router: 'cloudlist.service.kugou.com',
      data: { listid, userid: Number(userid), area_code: 1, show_relate_goods: 0, pagesize: 300, allplatform: 1, show_cover: 1, type: 0, token, page },
    });
    const data = record(json.data);
    const info = rows(data.info);
    files.push(...info);
    if (info.length < 300 || files.length >= (num(data.count) ?? 0)) break;
  }
  return files;
}

const fileKey = (file: Raw) => `${text(file.hash).toLowerCase()}.${text(file.album_id)}.${text(file.mixsongid ?? file.album_audio_id)}`;

async function addSongs(userid: string, token: string, listid: number, keys: string[]) {
  const clienttime = Math.floor(Date.now() / 1000);
  const data = keys.map(key => {
    const { hash, albumId, albumAudioId } = splitSongKey(key);
    return { number: 1, name: '', hash, size: 0, sort: 0, timelen: 0, bitrate: 0, album_id: Number(albumId) || 0, mixsongid: Number(albumAudioId) || 0 };
  });
  await kugouRequest({
    method: 'POST', path: '/cloudlist.service/v6/add_song', params: { last_time: clienttime, last_area: 'gztx', userid, token },
    data: { userid: Number(userid), token, listid, list_ver: 0, type: 0, slow_upload: 1, scene: 'false;null', data },
  });
}

async function deleteSongs(userid: string, token: string, listid: number, keys: string[]) {
  const wanted = new Set(keys.map(key => splitSongKey(key).hash));
  const files = (await listFiles(userid, token, listid)).filter(file => wanted.has(text(file.hash).toLowerCase()));
  if (!files.length) return;
  await kugouRequest({
    method: 'POST', path: '/v4/delete_songs', router: 'cloudlist.service.kugou.com',
    data: { listid, userid: Number(userid), data: files.map(file => ({ fileid: Number(file.fileid) })), type: 0, token, list_ver: 0 },
  });
}

async function addList(userid: string, token: string, extra: Raw) {
  const clienttime = Math.floor(Date.now() / 1000);
  const create = Number(extra.type) === 0;
  return kugouRequest<Raw>({
    method: 'POST', path: '/cloudlist.service/v5/add_list', params: create ? { last_time: clienttime, last_area: 'gztx', userid, token } : {},
    data: { userid: Number(userid), token, total_ver: 0, source: 1, is_pri: 0, list_create_gid: '', from_shupinmv: 0, ...extra },
  });
}

async function deleteList(userid: string, token: string, listid: number) {
  const clienttime = Math.floor(Date.now() / 1000);
  const aes = playlistAes({ listid, total_ver: 0, type: 1 });
  const bytes = await kugouRequest<Buffer>({
    method: 'POST', path: '/v2/delete_list', router: 'cloudlist.service.kugou.com', binary: true,
    params: { clienttime, key: paramsKey(clienttime), last_area: 'gztx', clientver: CLIENTVER, appid: APPID, last_time: clienttime, p: rsaPkcs1({ aes: aes.key, uid: Number(userid), token }) },
    data: aes.body,
  });
  const result = playlistAesDecrypt(bytes, aes.key);
  if (Number(result.status) !== 1 && result.status !== undefined) throw new KugouError(text(result.error_msg) || '删除歌单失败');
}

/* ───────── Provider ───────── */

export const kugouAccount: AccountProvider = {
  async qrCreate() {
    const json = await kugouRequest<Raw>({
      base: LOGIN_BASE, path: '/v2/qrcode', sign: 'web', clear: false,
      params: { appid: 1001, type: 1, plat: 4, qrcode_txt: `https://h5.kugou.com/apps/loginQRCode/html/index.html?appid=${APPID}&`, srcappid: SRCAPPID },
    });
    const key = text(record(json.data).qrcode);
    if (!key) throw new KugouError('获取登录二维码失败，请稍后重试');
    return { key, url: `https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=${key}` };
  },

  async qrCheck(key) {
    const json = await kugouRequest<Raw>({ base: LOGIN_BASE, path: '/v2/get_userinfo_qrcode', sign: 'web', params: { plat: 4, appid: APPID, srcappid: SRCAPPID, qrcode: key } });
    const data = record(json.data);
    const status = Number(data.status);
    // 0 expired · 1 waiting · 2 scanned (awaiting confirm) · 4 confirmed.
    if (status === 0) return { status: 'expired' };
    if (status === 2) return { status: 'scanned', nickname: text(data.nickname) || undefined, avatar: image(data.pic, 150) };
    if (status !== 4) return { status: 'waiting' };
    const userid = text(data.userid);
    const token = text(data.token);
    if (!userid || !token) throw new KugouError('登录状态校验失败，请重新扫码');
    const { dfid } = device();
    session.set('kugou', { userid, token, dfid });
    const info = await myInfo(userid, token).catch(() => ({} as Raw));
    const profile = toProfile(userid, info) ?? { id: userid, source: SOURCE, nickname: text(data.nickname) || '酷狗用户', avatar: image(data.pic, 240) };
    session.setProfile('kugou', profile);
    return { status: 'success', profile };
  },

  async profile() {
    const value = session.get('kugou');
    if (!value?.cookie.token || !value.cookie.userid) return null;
    try {
      const profile = toProfile(value.cookie.userid, await myInfo(value.cookie.userid, value.cookie.token));
      if (!profile) return value.profile ?? null;
      session.setProfile('kugou', profile);
      return profile;
    } catch (error) {
      if (error instanceof KugouError && error.status === 401) { session.clear('kugou'); return null; }
      if (error instanceof KugouError) return value.profile ?? null;
      throw error;
    }
  },

  async detail(): Promise<UserDetail> {
    const { userid, token, profile } = current();
    const info = await myInfo(userid, token).catch(() => ({} as Raw));
    const base = toProfile(userid, info) ?? profile ?? { id: userid, source: SOURCE, nickname: '酷狗用户' };
    const lists = await allLists(userid, token).catch(() => [] as OwnList[]);
    return {
      ...base,
      signature: text(info.descri ?? info.signature) || undefined,
      level: num(info.p_grade ?? info.grade),
      follows: num(info.follows),
      followers: num(info.fans),
      playlists: lists.filter(item => item.own).length || undefined,
      collections: { playlists: lists.filter(item => !item.own).length || undefined },
    };
  },

  async logout() {
    session.clear('kugou');
  },

  async likedIds() {
    const { userid, token } = current();
    const liked = (await allLists(userid, token)).find(item => item.liked);
    if (!liked) return [];
    return (await listFiles(userid, token, liked.listid)).map(fileKey);
  },

  async likeSong(id, like) {
    const { userid, token } = current();
    const liked = (await allLists(userid, token)).find(item => item.liked);
    if (!liked) throw new KugouError('未找到“我喜欢”歌单', 404);
    if (like) await addSongs(userid, token, liked.listid, [id]);
    else await deleteSongs(userid, token, liked.listid, [id]);
  },

  async userPlaylists() {
    const { userid, token } = current();
    const lists = await allLists(userid, token);
    const mapped: UserPlaylist[] = lists.filter(item => item.gid).map(item => ({
      id: item.gid, source: SOURCE, name: item.name, cover: item.cover, trackCount: item.count,
      own: item.own, liked: item.liked || undefined, privacy: item.isPrivate ? 'private' : 'public',
    }));
    // Liked list first, then created, then subscribed.
    return mapped.sort((a, b) => Number(Boolean(b.liked)) - Number(Boolean(a.liked)) || Number(b.own) - Number(a.own));
  },

  async subscribePlaylist(id, subscribe) {
    const { userid, token } = current();
    if (!subscribe) {
      const list = await listByGid(userid, token, id);
      await deleteList(userid, token, list.listid);
      return;
    }
    const info = await kugouRequest<Raw>({ method: 'POST', path: '/v3/get_list_info', router: 'pubsongs.kugou.com', data: { data: [{ global_collection_id: id }], userid: Number(userid), token } });
    const meta = rows(info.data)[0];
    if (!meta) throw new KugouError('歌单不存在', 404);
    await addList(userid, token, {
      type: 1, name: text(meta.name), list_create_userid: Number(meta.list_create_userid), list_create_listid: Number(meta.list_create_listid),
      list_create_gid: text(meta.list_create_gid ?? meta.global_collection_id),
    });
  },

  async createPlaylist(name, privacy) {
    const { userid, token } = current();
    const json = await addList(userid, token, { type: 0, name, is_pri: privacy === 'private' ? 1 : 0, list_create_userid: Number(userid), list_create_listid: 0 });
    const listid = Number(record(json.data).listid);
    const created = (await allLists(userid, token)).find(item => item.listid === listid || (item.own && item.name === name));
    if (!created?.gid) throw new KugouError('创建歌单失败，请稍后重试');
    return { id: created.gid, source: SOURCE, name, trackCount: 0, own: true, privacy };
  },

  async deletePlaylist(id) {
    const { userid, token } = current();
    const list = await listByGid(userid, token, id);
    if (!list.own) throw new KugouError('只能删除自己创建的歌单', 403);
    await deleteList(userid, token, list.listid);
  },

  async renamePlaylist() {
    // KugouMusicAPI exposes no rename endpoint for cloud lists.
    throw new KugouError('酷狗音乐暂不支持重命名歌单', 501);
  },

  async editPlaylistTracks(playlistId, trackIds, op) {
    const { userid, token } = current();
    const list = await listByGid(userid, token, playlistId);
    if (!list.own) throw new KugouError('只能修改自己创建的歌单', 403);
    if (op === 'add') await addSongs(userid, token, list.listid, trackIds);
    else await deleteSongs(userid, token, list.listid, trackIds);
  },
};
