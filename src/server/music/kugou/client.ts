import { createHash } from 'node:crypto';
import { CatalogError } from '../errors';
import { session } from '../session';
import { KUGOU_CONFIG, type KugouSource } from './config';
import { kugouVerificationUrl } from './verification';
import { conceptDevice, ensureConceptDevice } from './device';

export const APPID = 1005;
export const CLIENTVER = 12569;

const WEB_SALT = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt';
const UA = 'Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi';
const TIMEOUT_MS = 12_000;

export const md5 = (value: string) => createHash('md5').update(value).digest('hex');

export class KugouError extends CatalogError {
  constructor(message: string, status = 502, public readonly code?: number, public readonly verificationUrl?: string) {
    super(message, status);
  }
}

type Params = Record<string, string | number | boolean | undefined>;
const serialize = (value: unknown) => (typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value));

export function createKugouClient(source: KugouSource = 'kugou') {
  const config = KUGOU_CONFIG[source];
  const APPID = config.appid;
  const CLIENTVER = config.clientver;
  const ANDROID_SALT = config.salt;
  /** Android signature: md5(salt + sorted "k=v" + body + salt). */
  function androidSign(params: Params, body = '') {
    return md5(ANDROID_SALT + Object.keys(params).sort().map(key => `${key}=${serialize(params[key])}`).join('') + body + ANDROID_SALT);
  }

  /** Web signature (login endpoints): md5(salt + sorted list of "k=v" + salt). */
  function webSign(params: Params) {
    return md5(WEB_SALT + Object.keys(params).map(key => `${key}=${serialize(params[key])}`).sort().join('') + WEB_SALT);
  }

  /** `key` inside some bodies: md5(appid + salt + clientver + clienttime). */
  const paramsKey = (clienttime: string | number) => md5(`${APPID}${ANDROID_SALT}${CLIENTVER}${clienttime}`);

  /** Keep a saved identity; never replace it while retrying a rejected request. */
  function device(anonymous = false) {
    const cookie = session.get(source)?.cookie ?? {};
    const identity = source === 'kugou-lite' ? conceptDevice() : undefined;
    // An existing login is bound to its original device pair. QR login and
    // registration instead use the current installation, with no prior user.
    const bound = !anonymous && cookie.token && cookie.KUGOU_API_MID && cookie.dfid && cookie.dfid !== '-';
    const dfid = bound ? cookie.dfid : identity?.dfid || (!anonymous ? cookie.dfid : '') || '-';
    const mid = bound ? cookie.KUGOU_API_MID : identity?.mid || (!anonymous ? cookie.KUGOU_API_MID || cookie.mid : '') || md5(dfid);
    return { dfid, mid, uuid: '-', userid: anonymous ? '0' : cookie.userid || '0', token: anonymous ? '' : cookie.token || '' };
  }

  /** song_url `key`: md5(hash + salt + appid + mid + userid). */
  const songKey = (hash: string, mid: string, userid: string) => md5(`${hash}${config.streamSalt}${APPID}${mid}${userid || 0}`);

  type Raw = Record<string, unknown>;

  /**
   * One gateway call. `router` sets x-router (routes gateway.kugou.com to a
   * backend service). Default params (dfid, mid, appid, …, token when logged in)
   * are merged under the module's own unless `clear` is set.
   */
  async function sendRequest<T = Raw>(options: {
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
    /** Device registration and QR login must not inherit a previous user. */
    anonymous?: boolean;
  }): Promise<T> {
    const identity = device(options.anonymous);
    const { dfid, mid, uuid } = identity;
    const userid = options.anonymous ? '0' : identity.userid;
    const token = options.anonymous ? '' : identity.token;
    const clienttime = Math.floor(Date.now() / 1000);
    const params: Params = options.clear
      ? { ...options.params }
      : { dfid, mid, uuid, appid: APPID, clientver: CLIENTVER, userid, clienttime, ...(token ? { token } : {}), ...options.params };
    const body = options.data === undefined ? '' : Buffer.isBuffer(options.data) ? options.data : typeof options.data === 'string' ? options.data : JSON.stringify(options.data);
    // Cloud-list binary bodies use their own `key`/RSA envelope rather than Android signature.
    if (!Buffer.isBuffer(body)) params.signature = options.sign === 'web' ? webSign(params) : androidSign(params, body);
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, serialize(value)]));
    const method = options.method ?? 'GET';
    let response: Response;
    try {
      response = await fetch(`${options.base ?? 'https://gateway.kugou.com'}${options.path}?${query}`, {
        method,
        body: method === 'GET' ? undefined : Buffer.isBuffer(body) ? new Uint8Array(body) : body,
        headers: {
          'User-Agent': UA, dfid, mid, clienttime: String(clienttime), 'kg-rc': '1', 'kg-thash': '5d816a0', 'kg-rec': '1', 'kg-rf': 'B9EDA08A64250DEFFBCADDEE00F8F25F',
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
    // Security verification is not a missing song. Propagate it even for raw
    // tracker replies so the quality fallback cannot turn it into a fake 404.
    const code = Number(json.error_code ?? json.errcode ?? 0);
    if (code === 20028) throw new KugouError('酷狗接口拒绝了本次请求（20028：需要安全验证）', 403, code, kugouVerificationUrl(response.headers.get('ssa-code'), options.path));
    if (!options.raw) {
      if (json.status === 0 || (code && code !== 0)) {
        // These are authentication rejections, not proof of a token's natural
        // expiry. Device binding and request construction must also be checked.
        if (code === 20010 || code === 20018 || code === 30768 || (code === 20017 && options.router === 'cloudlist.service.kugou.com')) {
          throw new KugouError(`${source === 'kugou-lite' ? '酷狗概念版' : '酷狗音乐'}账号认证未通过（${code}），登录信息已保留`, 401, code);
        }
        throw new KugouError(String(json.error_msg ?? json.errmsg ?? json.error ?? `酷狗音乐接口错误（${code || json.status}）`), 502, code || undefined);
      }
    }
    return json as T;
  }

  async function ensureDevice() {
    if (source !== 'kugou-lite') return;
    try { await ensureConceptDevice(options => sendRequest<Buffer>(options)); }
    catch (error) { if (error instanceof KugouError) throw error; throw new KugouError(error instanceof Error ? error.message : '酷狗设备初始化失败'); }
  }
  async function kugouRequest<T = Raw>(options: Parameters<typeof sendRequest>[0]): Promise<T> {
    await ensureDevice();
    return sendRequest<T>(options);
  }
  return { source, config, APPID, CLIENTVER, device, ensureDevice, androidSign, webSign, paramsKey, songKey, kugouRequest };
}
export type KugouClient = ReturnType<typeof createKugouClient>;
export const { device, androidSign, webSign, paramsKey, songKey, kugouRequest } = createKugouClient();
