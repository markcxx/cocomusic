import { session } from '../session';
import type { AccountProvider, UserDetail, UserPlaylist, UserProfile } from '../types';
import { QQError, qqRequest } from './client';
import { qqQrPoll, qqQrStart } from './login';
import { https, mapPlaylistBasic, num, record, rows, splitSongKey, SOURCE, text, type Raw } from './mappers';

// Endpoints follow multiPlatformMusicApi platforms/qqmusic/module (user_*, playlist_*, like, likelist).

/** "我喜欢" is the system playlist with dirId 201. */
const LIKED_DIR = 201;

function current() {
  const value = session.get('qq');
  if (!value?.cookie.uin || !value.cookie.qm_keyst) throw new QQError('请先登录 QQ 音乐账号', 401);
  return { uin: value.cookie.uin, profile: value.profile };
}

async function fetchProfile(uin: string): Promise<UserProfile | null> {
  const data = await qqRequest<Raw>('userInfo.BaseUserInfoServer', 'get_user_baseinfo_v2', { vec_uin: [uin] });
  const info = record(record(data.map_userinfo)[uin]);
  if (!text(info.nick)) return null;
  return { id: uin, source: SOURCE, nickname: text(info.nick), avatar: https(info.headurl), vipType: num(info.vipType ?? info.svip) ?? 0 };
}

/** Created playlists with their dirId (write calls address playlists by dirId). */
async function created(uin: string) {
  const data = await qqRequest<Raw>('music.musicasset.PlaylistBaseRead', 'GetPlaylistByUin', { uin });
  return rows(data.v_playlist).map(item => ({
    id: text(item.tid),
    dirId: Number(item.dirId),
    name: text(item.dirName),
    cover: https(item.picUrl),
    trackCount: num(item.songNum),
  }));
}

async function dirIdOf(uin: string, playlistId: string) {
  const list = await created(uin);
  const found = list.find(item => item.id === playlistId);
  if (!found) throw new QQError('只能修改自己创建的歌单', 403);
  return found.dirId;
}

/** Numeric song ids for write calls ("<mid>.<id>" keys carry them). */
const songIds = (keys: string[]) => keys.map(key => Number(splitSongKey(key).id)).filter(Boolean);

export const qqAccount: AccountProvider = {
  async qrCreate() {
    const { key, image } = await qqQrStart();
    // QQ serves its own QR image; `url` is unused for this platform.
    return { key, url: '', image };
  },

  async qrCheck(key) {
    const result = await qqQrPoll(key);
    if (result.status === 'waiting') return { status: 'waiting' };
    if (result.status === 'scanned') return { status: 'scanned' };
    if (result.status === 'expired') return { status: 'expired' };
    session.set('qq', result.cookie);
    const profile = await fetchProfile(result.cookie.uin).catch(() => null);
    if (!profile) { session.clear('qq'); throw new QQError('登录状态校验失败，请重新扫码'); }
    session.setProfile('qq', profile);
    return { status: 'success', profile };
  },

  async profile() {
    const value = session.get('qq');
    if (!value?.cookie.uin || !value.cookie.qm_keyst) return null;
    try {
      const profile = await fetchProfile(value.cookie.uin);
      if (!profile) { session.clear('qq'); return null; }
      session.setProfile('qq', profile);
      return profile;
    } catch (error) {
      // Offline or expired key: keep the cached profile only when it was a network problem.
      if (error instanceof QQError && error.status === 504) return value.profile ?? null;
      if (error instanceof QQError && error.status === 401) { session.clear('qq'); return null; }
      throw error;
    }
  },

  async detail(): Promise<UserDetail> {
    const { uin, profile } = current();
    const base = profile ?? (await fetchProfile(uin)) ?? { id: uin, source: SOURCE, nickname: 'QQ 音乐用户' };
    const playlists = await created(uin).catch(() => []);
    return { ...base, playlists: playlists.length, url: `https://y.qq.com/n/ryqq/profile/like/song?uin=${uin}` };
  },

  async logout() {
    session.clear('qq');
  },

  async likedIds() {
    const { uin } = current();
    const data = await qqRequest<Raw>('music.srfDissInfo.aiDissInfo', 'uniform_get_Dissinfo', { disstid: 0, dirid: LIKED_DIR, userinfo: 0, tag: 0, orderlist: 1, song_begin: 0, song_num: 2000, onlysonglist: 1, enc_host_uin: '' });
    void uin;
    return rows(data.songlist).map(song => `${text(song.mid)}.${text(song.id)}`).filter(id => id !== '.');
  },

  async likeSong(id, like) {
    current();
    const songId = Number(splitSongKey(id).id);
    if (!songId) throw new QQError('歌曲信息不完整', 400);
    await qqRequest('music.musicasset.PlaylistDetailWrite', like ? 'AddSonglist' : 'DelSonglist', { dirId: LIKED_DIR, v_songInfo: [{ songType: 0, songId }] });
  },

  async userPlaylists() {
    const { uin } = current();
    const [own, fav] = await Promise.all([
      created(uin),
      qqRequest<Raw>('music.musicasset.PlaylistFavRead', 'GetPlaylistFavInfo', { uin }).catch(() => ({} as Raw)),
    ]);
    const mine: UserPlaylist[] = own.map(item => ({
      id: item.id, source: SOURCE, name: item.dirId === LIKED_DIR ? '我喜欢' : item.name, cover: item.cover, trackCount: item.trackCount,
      own: true, liked: item.dirId === LIKED_DIR, privacy: 'public',
    }));
    // Liked playlist first, as on the other platforms.
    mine.sort((a, b) => Number(Boolean(b.liked)) - Number(Boolean(a.liked)));
    const subscribed: UserPlaylist[] = rows(fav.v_list).map(item => ({ ...mapPlaylistBasic({ tid: item.tid, title: item.name, picurl: item.logo, song_cnt: item.songnum, creator: { nick: item.nickname } }), own: false }));
    return [...mine, ...subscribed];
  },

  async subscribePlaylist(id, subscribe) {
    const { uin } = current();
    await qqRequest('music.musicasset.PlaylistFavWrite', subscribe ? 'FavPlaylist' : 'CancelFavPlaylist', { uin, v_playlistId: [Number(id)] });
  },

  async createPlaylist(name) {
    current();
    const data = await qqRequest<Raw>('music.musicasset.PlaylistBaseWrite', 'AddPlaylist', { dirName: name });
    const result = record(data.result);
    if (!text(result.id ?? result.tid)) throw new QQError('创建歌单失败，请稍后重试');
    return { id: text(result.id ?? result.tid), source: SOURCE, name, trackCount: 0, own: true, privacy: 'public' };
  },

  async deletePlaylist(id) {
    const { uin } = current();
    await qqRequest('music.musicasset.PlaylistBaseWrite', 'DelPlaylist', { dirId: await dirIdOf(uin, id) });
  },

  async renamePlaylist(id, name) {
    const { uin } = current();
    await qqRequest('music.musicasset.PlaylistBaseWrite', 'ModifyPlaylist', { dirId: await dirIdOf(uin, id), dirName: name });
  },

  async editPlaylistTracks(playlistId, trackIds, op) {
    const { uin } = current();
    const ids = songIds(trackIds);
    if (!ids.length) throw new QQError('歌曲信息不完整', 400);
    const data = await qqRequest<Raw>('music.musicasset.PlaylistDetailWrite', op === 'del' ? 'DelSonglist' : 'AddSonglist', {
      dirId: await dirIdOf(uin, playlistId),
      v_songInfo: ids.map(songId => ({ songType: 0, songId })),
    });
    if (Number(data.retCode ?? 0) !== 0) throw new QQError(op === 'del' ? '移除失败' : '添加失败');
  },
};
