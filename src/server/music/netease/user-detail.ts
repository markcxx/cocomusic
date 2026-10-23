import type { UserDetail, UserProfile } from '../types';
import { neteaseRequest } from './client';
import { image, num, record, text, type Raw } from './mappers';
import { regionName } from './regions';

// user_detail + user_subcount (CloudMusicApi / multiPlatformMusicApi netease modules).

const ZODIAC: Array<[number, string]> = [
  [120, '摩羯座'], [219, '水瓶座'], [321, '双鱼座'], [420, '白羊座'], [521, '金牛座'], [622, '双子座'],
  [723, '巨蟹座'], [823, '狮子座'], [923, '处女座'], [1024, '天秤座'], [1123, '天蝎座'], [1222, '射手座'], [1232, '摩羯座'],
];

/** Birthday → 00后 / 双子座. Upstream returns negative or tiny values when hidden. */
function fromBirthday(ms?: number) {
  if (!ms || ms < 0) return {};
  const date = new Date(ms);
  const year = date.getFullYear();
  if (year < 1920 || year > new Date().getFullYear()) return {};
  const key = (date.getMonth() + 1) * 100 + date.getDate();
  const zodiac = ZODIAC.find(([limit]) => key < limit)?.[1];
  return { ageGroup: `${String(Math.floor(year / 10) * 10).slice(2)}后`, zodiac };
}

/** Upstream auth types we can name; others still count as verified. */
const AUTH_LABELS: Record<number, string> = { 2: '网易音乐人', 4: '网易音乐人', 10: '官方认证', 200: '达人' };

export async function userDetail(base: UserProfile): Promise<UserDetail> {
  const [detail, counts] = await Promise.allSettled([
    neteaseRequest<Raw>(`/v1/user/detail/${base.id}`),
    neteaseRequest<Raw>('/subcount'),
  ]);
  const data = detail.status === 'fulfilled' ? detail.value : {};
  const profile = record(data.profile);
  const sub = counts.status === 'fulfilled' ? counts.value : {};
  const gender = num(profile.gender);
  const authType = num(record(record(profile.mainAuthType)).type ?? profile.authority);
  const createdAt = num(data.createTime ?? profile.createTime);

  return {
    ...base,
    nickname: text(profile.nickname) || base.nickname,
    avatar: image(profile.avatarUrl, 200) ?? base.avatar,
    vipType: num(profile.vipType) ?? base.vipType,
    background: image(profile.backgroundUrl, 800),
    signature: text(profile.signature).trim() || undefined,
    level: num(data.level),
    listenSongs: num(data.listenSongs),
    accountDays: num(data.createDays),
    createdAt,
    gender: gender === 1 ? 'male' : gender === 2 ? 'female' : undefined,
    ...fromBirthday(num(profile.birthday)),
    region: regionName(num(profile.province), num(profile.city)),
    follows: num(profile.follows),
    followers: num(profile.followeds),
    events: num(profile.eventCount),
    playlists: num(profile.playlistCount) ?? num(sub.createdPlaylistCount),
    collections: counts.status === 'fulfilled'
      ? { playlists: num(sub.subPlaylistCount), albums: num(sub.albumCount ?? sub.subAlbumCount), artists: num(sub.artistCount), mvs: num(sub.mvCount) }
      : undefined,
    verified: authType && AUTH_LABELS[authType] ? AUTH_LABELS[authType] : undefined,
    url: `https://music.163.com/#/user/home?id=${base.id}`,
  };
}
