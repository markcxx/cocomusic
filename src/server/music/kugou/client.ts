import { createHash } from 'node:crypto';
import { CatalogError } from '../errors';
import { session } from '../session';

// Request pipeline follows KugouMusicAPI util/request.js + util/helper.js.

export const APPID = 1005;
export const CLIENTVER = 12569;
const ANDROID_SALT = 'OIlwieks28dk2k092lksi2UIkp';
const WEB_SALT = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt';
const UA = 'Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi';
const TIMEOUT_MS = 12_000;

export const md5 = (value: string) => createHash('md5').update(value).digest('hex');

export class KugouError extends CatalogError {
  constructor(message: string, status = 502, public readonly code?: number) {
    super(message, status);
  }
}

type Params = Record<string, string | number | boolean | undefined>;
const serialize = (value: unknown) => (typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value));

/** Android signature: md5(salt + sorted "k=v" + body + salt). */
export function androidSign(params: Params, body = '') {
  return md5(ANDROID_SALT + Object.keys(params).sort().map(key => `${key}=${serialize(params[key])}`).join('') + body + ANDROID_SALT);
}

/** Web signature (login endpoints): md5(salt + sorted list of "k=v" + salt). */
export function webSign(params: Params) {
  return md5(WEB_SALT + Object.keys(params).map(key => `${key}=${serialize(params[key])}`).sort().join('') + WEB_SALT);
}

/** `key` inside some bodies: md5(appid + salt + clientver + clienttime). */
export const paramsKey = (clienttime: string | number) => md5(`${APPID}${ANDROID_SALT}${CLIENTVER}${clienttime}`);

/** Device identity: KugouMusicAPI uses dfid '-' anonymously, mid = md5(dfid). */
export function device() {
  const cookie = session.get('kugou')?.cookie ?? {};
  const dfid = cookie.dfid || '-';
  const mid = md5(dfid);
  return { dfid, mid, uuid: md5(dfid + mid), userid: cookie.userid || '0', token: cookie.token || '' };
}

/** song_url `key`: md5(hash + salt + appid + mid + userid). */
export const songKey = (hash: string, mid: string, userid: string) => md5(`${hash}57ae12eb6890223e355ccfcb74edf70d${APPID}${mid}${userid || 0}`);

type Raw = Record<string, unknown>;

/**
 * One gateway call. `router` sets x-router (routes gateway.kugou.com to a
 * backend service). Default params (dfid, mid, appid, …, token when logged in)
 * are merged under the module's own unless `clear` is set.
 */
export async function kugouRequest<T = Raw>(options: {
  method?: 'GET' | 'POST';
  base?: string;
  path: string;
  params?: Params;
  data?: unknown;
  router?: string;
  headers?: Record<string, string>;
  clear?: boolean;
  sign?: 'android' | 'web';
  /** Accept a body with status 0 / error_code as success (caller inspects it). */
  raw?: boolean;
  /** Return the raw response bytes (encrypted cloudlist replies). */
  binary?: boolean;
}): Promise<T> {
  const { dfid, mid, uuid, userid, token } = device();
  const clienttime = Math.floor(Date.now() / 1000);
  const params: Params = options.clear
    ? { ...options.params }
    : { dfid, mid, uuid, appid: APPID, clientver: CLIENTVER, userid, clienttime, ...(token ? { token } : {}), ...options.params };
  const body = options.data === undefined ? '' : typeof options.data === 'string' ? options.data : JSON.stringify(options.data);
  params.signature = options.sign === 'web' ? webSign(params) : androidSign(params, body);
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, serialize(value)]));
  const method = options.method ?? 'GET';
  let response: Response;
  try {
    response = await fetch(`${options.base ?? 'https://gateway.kugou.com'}${options.path}?${query}`, {
      method,
      body: method === 'GET' ? undefined : body,
      headers: {
        'User-Agent': UA, dfid, mid, clienttime: String(clienttime),
        ...(options.router ? { 'x-router': options.router } : {}),
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new KugouError(timedOut ? '酷狗音乐请求超时，请稍后重试' : '无法连接酷狗音乐，请检查网络', 504);
  }
  if (!response.ok) throw new KugouError(`酷狗音乐返回异常状态（${response.status}）`);
  if (options.binary) return Buffer.from(await response.arrayBuffer()) as T;
  let json: Raw;
  try { json = await response.json() as Raw; } catch { throw new KugouError('酷狗音乐返回了无法解析的数据'); }
  if (!options.raw) {
    const code = Number(json.error_code ?? json.errcode ?? 0);
    if (json.status === 0 || (code && code !== 0)) {
      if (code === 20010 || code === 20018 || code === 30768) throw new KugouError('请先登录酷狗音乐账号', 401, code);
      throw new KugouError(String(json.error_msg ?? json.errmsg ?? json.error ?? `酷狗音乐接口错误（${code || json.status}）`), 502, code || undefined);
    }
  }
  return json as T;
}
