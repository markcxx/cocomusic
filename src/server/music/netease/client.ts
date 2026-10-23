import { randomBytes } from 'node:crypto';
import { session } from '../session';
import { eapiCheckToken } from './check-token';
import { eapi, eapiDecrypt, weapi } from './crypto';

const BASE = 'https://music.163.com';
const EAPI_BASE = 'https://interface.music.163.com';
const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/3.1.19.204510';
const TIMEOUT_MS = 12000;

export class NeteaseError extends Error {
  constructor(message: string, public readonly status = 502, public readonly code?: number) {
    super(message);
  }
}

type Raw = Record<string, unknown>;
type Options = {
  /** Send the logged-in MUSIC_U (default true when a session exists). */
  auth?: boolean;
  /** Add x-anticheattoken (some eapi write endpoints require it). */
  checkToken?: boolean;
  /** Accept these non-200 business codes as success (e.g. QR polling 800–803). */
  okCodes?: number[];
  /** Receive response Set-Cookie pairs (used by QR login). */
  onCookies?: (cookies: Record<string, string>) => void;
};

// Anonymous web visitor cookie, stable per process.
const visitor = [`NMTID=${randomBytes(16).toString('hex')}`, `_ntes_nuid=${randomBytes(16).toString('hex')}`];

const musicU = (options: Options) => (options.auth === false ? '' : session.get('netease')?.cookie.MUSIC_U ?? '');

function parseSetCookie(response: Response) {
  const pairs: Record<string, string> = {};
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const index = pair.indexOf('=');
    if (index > 0) pairs[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
  }
  return pairs;
}

async function send(url: string, form: Record<string, string>, headers: Record<string, string>) {
  try {
    return await fetch(url, {
      method: 'POST',
      body: new URLSearchParams(form),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new NeteaseError(timedOut ? '网易云音乐请求超时，请稍后重试' : '无法连接网易云音乐，请检查网络', 504);
  }
}

function check<T>(body: (Raw & { code?: number; message?: string; msg?: string }) | null, options: Options): T {
  if (!body) throw new NeteaseError('网易云音乐返回了无法解析的数据');
  const code = Number(body.code);
  if (code === 200 || options.okCodes?.includes(code)) return body as T;
  if (code === 301) throw new NeteaseError('请先登录网易云音乐账号', 401, code);
  throw new NeteaseError(String(body.message || body.msg || `网易云音乐接口错误（${body.code}）`), 502, code);
}

/**
 * POST to music.163.com. `crypto: 'weapi'` encrypts like the web client;
 * `'api'` sends a plain form. Paths are given without the /weapi or /api prefix.
 */
export async function neteaseRequest<T = Raw>(path: string, data: Raw = {}, options: Options & { crypto?: 'weapi' | 'api' } = {}): Promise<T> {
  const mode = options.crypto ?? 'weapi';
  const form = mode === 'weapi' ? weapi({ ...data, csrf_token: '' }) : Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)]));
  const token = musicU(options);
  const cookie = ['__remember_me=true', 'os=pc', 'appver=3.1.19.204510', ...visitor, ...(token ? [`MUSIC_U=${token}`] : [])].join('; ');
  const response = await send(`${BASE}/${mode}${path}`, form, { 'User-Agent': WEB_UA, Referer: `${BASE}/`, Origin: BASE, Cookie: cookie });
  if (!response.ok) throw new NeteaseError(`网易云音乐返回异常状态（${response.status}）`);
  options.onCookies?.(parseSetCookie(response));
  return check<T>(await response.json().catch(() => null), options);
}

/** Desktop-client endpoint (e.g. /api/cloudsearch/pc). `uri` keeps its /api prefix. */
export async function neteaseEapi<T = Raw>(uri: string, data: Raw = {}, options: Options = {}): Promise<T> {
  const token = musicU(options);
  // The eapi header doubles as cookie, as the desktop client sends it.
  const header: Record<string, string> = {
    os: 'pc',
    appver: '3.1.19.204510',
    osver: 'Microsoft-Windows-11-Home-China-build-22631-64bit',
    requestId: '0',
    deviceId: session.deviceId(),
    ...(token ? { MUSIC_U: token } : {}),
  };
  const headers: Record<string, string> = {
    'User-Agent': DESKTOP_UA,
    Cookie: Object.entries(header).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('; '),
  };
  const payload: Raw = { ...data, header: { ...header } };
  if (options.checkToken) {
    const checkToken = eapiCheckToken();
    headers['x-anticheattoken'] = checkToken;
    (payload.header as Raw)['X-anticheattoken'] = checkToken;
  }
  const response = await send(`${EAPI_BASE}/eapi${uri.slice(4)}`, eapi(uri, { ...payload, e_r: true }), headers);
  if (!response.ok) throw new NeteaseError(`网易云音乐返回异常状态（${response.status}）`);
  options.onCookies?.(parseSetCookie(response));
  const buffer = Buffer.from(await response.arrayBuffer());
  let body: Raw | null = null;
  try {
    body = JSON.parse(buffer.toString('utf8'));
  } catch {
    try { body = JSON.parse(eapiDecrypt(buffer)); } catch { body = null; }
  }
  return check<T>(body as never, options);
}
