import type { AccountProvider, QrLoginState, UserPlaylist, UserProfile } from '../types';
import { session } from '../session';
import { NeteaseError, neteaseEapi, neteaseRequest } from './client';
import { image, mapPlaylist, num, record, rows, SOURCE, text, type Raw } from './mappers';

// Endpoints follow multiPlatformMusicApi platforms/netease/module (eapi, desktop client identity).

function mapProfile(profile: Raw, account: Raw = {}): UserProfile {
  return {
    id: text(profile.userId ?? account.id),
    source: SOURCE,
    nickname: text(profile.nickname) || '网易云用户',
    avatar: image(profile.avatarUrl, 120),
    vipType: num(account.vipType ?? profile.vipType) ?? 0,
  };
}

function requireUser(): UserProfile {
  const current = session.get('netease');
  if (!current?.cookie.MUSIC_U || !current.profile) throw new NeteaseError('请先登录网易云音乐账号', 401);
  return current.profile;
}

async function fetchProfile(): Promise<UserProfile | null> {
  const data = await neteaseRequest<Raw>('/nuser/account/get');
  const profile = record(data.profile);
  if (!text(profile.userId)) return null;
  return mapProfile(profile, record(data.account));
}

export const neteaseAccount: AccountProvider = {
  async qrCreate() {
    const data = await neteaseEapi<Raw>('/api/login/qrcode/unikey', { type: 3 }, { auth: false });
    const key = text(data.unikey);
    if (!key) throw new NeteaseError('无法获取登录二维码，请稍后重试');
    // The QR encodes this URL; the NetEase Cloud Music app opens it to confirm login.
    return { key, url: `https://music.163.com/login?codekey=${encodeURIComponent(key)}` };
  },

  async qrCheck(key) {
    let cookies: Record<string, string> = {};
    // 800 expired · 801 waiting · 802 scanned (awaiting confirm) · 803 success
    const data = await neteaseEapi<Raw>('/api/login/qrcode/client/login', { key, type: 3 }, { auth: false, okCodes: [800, 801, 802, 803], onCookies: value => { cookies = value; } });
    const code = Number(data.code);
    if (code === 800) return { status: 'expired' } satisfies QrLoginState;
    if (code === 801) return { status: 'waiting' };
    if (code === 802) return { status: 'scanned', nickname: text(data.nickname) || undefined, avatar: image(data.avatarUrl, 120) };
    if (!cookies.MUSIC_U) throw new NeteaseError('登录未返回凭据，请重新扫码');
    session.set('netease', cookies);
    const profile = await fetchProfile();
    if (!profile) { session.clear('netease'); throw new NeteaseError('登录状态校验失败，请重新扫码'); }
    session.setProfile('netease', profile);
    return { status: 'success', profile };
  },

  async profile() {
    const current = session.get('netease');
    if (!current?.cookie.MUSIC_U) return null;
    try {
      const profile = await fetchProfile();
      if (!profile) { session.clear('netease'); return null; }
      session.setProfile('netease', profile);
      return profile;
    } catch (error) {
      // Offline: keep the cached profile instead of logging the user out.
      if (error instanceof NeteaseError && error.status === 504) return current.profile ?? null;
      throw error;
    }
  },

  async logout() {
    await neteaseRequest('/logout').catch(() => undefined);
    session.clear('netease');
  },

  async likedIds() {
    const user = requireUser();
    const data = await neteaseEapi<Raw>('/api/song/like/get', { uid: user.id });
    return (Array.isArray(data.ids) ? data.ids : []).map(text).filter(Boolean);
  },

  async likeSong(id, like) {
    const user = requireUser();
    await neteaseEapi('/api/song/like', { trackId: id, userid: user.id, like });
  },

  async userPlaylists() {
    const user = requireUser();
    const data = await neteaseEapi<Raw>('/api/user/playlist', { uid: user.id, limit: '1000', offset: '0' });
    const list = rows(data.playlist);
    // 我喜欢的音乐 is marked specialType 5; upstream also always lists it first among the user's own.
    const likedIndex = Math.max(0, list.findIndex(item => Number(item.specialType) === 5));
    return list.map((item, index): UserPlaylist => {
      const creator = text(record(item.creator).userId ?? item.userId);
      const own = creator === user.id;
      return {
        ...mapPlaylist(item),
        own,
        liked: own && index === likedIndex,
        privacy: Number(item.privacy) === 10 ? 'private' : 'public',
      };
    });
  },

  async subscribePlaylist(id, subscribe) {
    requireUser();
    await neteaseEapi(`/api/playlist/${subscribe ? 'subscribe' : 'unsubscribe'}`, { id });
  },

  async createPlaylist(name, privacy) {
    requireUser();
    const data = await neteaseEapi<Raw>('/api/playlist/create', { name, privacy: privacy === 'private' ? '10' : '0', type: 'NORMAL' }, { checkToken: true });
    const playlist = record(data.playlist);
    if (!text(playlist.id)) throw new NeteaseError('创建歌单失败，请稍后重试');
    return { ...mapPlaylist(playlist), own: true, privacy };
  },

  async deletePlaylist(id) {
    requireUser();
    await neteaseRequest('/playlist/remove', { ids: `[${id}]` });
  },

  async renamePlaylist(id, name) {
    requireUser();
    // playlist_name_update (CloudMusicApi).
    await neteaseEapi('/api/playlist/update/name', { id, name });
  },

  async editPlaylistTracks(playlistId, trackIds, op) {
    requireUser();
    const body = { op, pid: playlistId, trackIds: JSON.stringify(trackIds), imme: 'true' };
    try {
      await neteaseEapi('/api/playlist/manipulate/tracks', body);
    } catch (error) {
      // Upstream quirk (code 512): retry with the ids duplicated, as the reference client does.
      if (!(error instanceof NeteaseError) || error.code !== 512) throw error;
      await neteaseEapi('/api/playlist/manipulate/tracks', { ...body, trackIds: JSON.stringify([...trackIds, ...trackIds]) });
    }
  },
};
