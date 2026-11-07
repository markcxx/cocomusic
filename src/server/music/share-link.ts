import { CatalogError } from './errors';
import { validId } from './ids';
import type { CatalogSource } from './types';

/** Platforms a pasted playlist link can point to (酷狗 and 酷狗概念版 share ids). */
export type SharePlatform = 'netease' | 'qq' | 'kugou';
export type SharedPlaylist = { platform: SharePlatform; id: string };

/**
 * Catalog that opens a shared playlist: Kugou links serve both Kugou clients,
 * so they stay on 酷狗概念版 while that is the selected platform.
 */
export const shareSource = (platform: SharePlatform, selected: CatalogSource): CatalogSource =>
  platform === 'kugou' && selected === 'kugou-lite' ? 'kugou-lite' : platform;

/**
 * Hosts the resolver may contact. Pasted text is untrusted, so short links are
 * only followed while every hop stays on a platform's own share domains.
 */
const PLATFORM_HOSTS: Record<SharePlatform, RegExp> = {
  netease: /^(163cn\.tv|([a-z0-9-]+\.)*music\.163\.com)$/,
  qq: /^([a-z0-9-]+\.)*y\.qq\.com$/,
  kugou: /^([a-z0-9-]+\.)*kugou\.com$/,
};
const SHORT_HOSTS = /^(163cn\.tv|c6?\.y\.qq\.com|t\d+\.kugou\.com)$/;
const MAX_HOPS = 5;
const TIMEOUT_MS = 8000;
const MAX_BODY = 512 * 1024;

const platformOf = (host: string) => (Object.keys(PLATFORM_HOSTS) as SharePlatform[]).find(platform => PLATFORM_HOSTS[platform].test(host));

/** URLs in pasted share text, e.g. "分享歌单《…》: https://163cn.tv/xyz (来自@网易云音乐)". */
export function extractUrls(text: string): URL[] {
  const urls: URL[] = [];
  for (const match of text.matchAll(/https?:\/\/[^\s"'<>，。（）()【】]+/gi)) {
    try { urls.push(new URL(match[0])); } catch { /* not a URL */ }
  }
  return urls;
}

/** First playlist id found in the query string or path, checked against the platform's id format. */
function pick(platform: SharePlatform, candidates: Array<string | null | undefined>): SharedPlaylist | null {
  const id = candidates.find((value): value is string => Boolean(value) && validId(platform, 'playlist', value!));
  return id ? { platform, id } : null;
}

/**
 * Playlist id from a long share URL, or null when the URL is not a playlist page.
 * NetEase keeps the route in the hash (music.163.com/#/playlist?id=…).
 */
export function parsePlaylistUrl(url: URL): SharedPlaylist | null {
  const platform = platformOf(url.hostname);
  if (!platform) return null;
  const hash = url.hash.startsWith('#') ? new URL(url.hash.slice(1), url.origin) : null;
  const paths = [url.pathname, hash?.pathname ?? ''];
  const param = (name: string) => url.searchParams.get(name) ?? hash?.searchParams.get(name);
  switch (platform) {
    case 'netease':
      return paths.some(path => /\/playlist\/?$/.test(path)) ? pick(platform, [param('id')]) : null;
    case 'qq': {
      const fromPath = paths.map(path => /\/playlist\/(\d+)/.exec(path)?.[1]);
      const taoge = paths.some(path => /taoge|playlist/.test(path));
      return pick(platform, [...fromPath, taoge ? param('id') : null, param('disstid')]);
    }
    case 'kugou': {
      const fromPath = paths.map(path => /\/songlist\/([0-9a-z_]+)/i.exec(path)?.[1]);
      return pick(platform, [...fromPath, param('global_collection_id'), param('gcid')]);
    }
  }
}

/** Ids embedded in a share page that redirects with script instead of HTTP. */
function parsePageBody(platform: SharePlatform, html: string): SharedPlaylist | null {
  if (platform === 'kugou') return pick(platform, [/global_collection_id["'=:\s]+["']?((?:collection|gcid)_[0-9a-z_]+)/i.exec(html)?.[1]]);
  for (const url of extractUrls(html.replaceAll('\\/', '/'))) {
    const found = parsePlaylistUrl(url);
    if (found?.platform === platform) return found;
  }
  return null;
}

/** Follow a short link one hop at a time, refusing any hop that leaves the platform's domains. */
async function resolveShortLink(start: URL): Promise<SharedPlaylist | null> {
  let url = start;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const platform = platformOf(url.hostname);
    if (!platform || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null;
    const direct = parsePlaylistUrl(url);
    if (direct) return direct;
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' } });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); return null; }
    const html = (await response.text()).slice(0, MAX_BODY);
    return parsePageBody(platform, html);
  }
  return null;
}

/** Playlist behind pasted share text: a long URL parses locally, a short link is followed. */
export async function resolveSharedPlaylist(text: string): Promise<SharedPlaylist> {
  const urls = extractUrls(text);
  if (!urls.length) throw new CatalogError('没有找到链接，请粘贴歌单的分享链接', 400);
  for (const url of urls) {
    const direct = parsePlaylistUrl(url);
    if (direct) return direct;
  }
  const short = urls.find(url => SHORT_HOSTS.test(url.hostname));
  if (!short) throw new CatalogError('暂只支持网易云音乐、QQ 音乐和酷狗音乐的歌单链接', 400);
  const resolved = await resolveShortLink(short).catch(() => null);
  if (!resolved) throw new CatalogError('无法识别这个分享链接，请确认它指向一个歌单', 422);
  return resolved;
}
