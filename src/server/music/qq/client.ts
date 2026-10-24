import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { CatalogError } from '../errors';
import { session } from '../session';

// Request pipeline follows multiPlatformMusicApi platforms/qqmusic/util (request.js, crypto.js).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TIMEOUT_MS = 12_000;

/** ag-1 request body: AES-128-GCM, packed as base64([12B IV][ciphertext][16B tag]). */
const REQUEST_KEY = Buffer.from('bd305f10d0ff74b6ef54dab835b5e1cf', 'hex');
/** ag-1 response body: cyclic XOR with this 21-byte key. */
const RESPONSE_KEY = Buffer.from('7a3f8c1d5e9b2f0a6c4d7e8b1f3a5c9d0e2b6f4a81', 'hex');

function encrypt(json: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-128-gcm', REQUEST_KEY, iv, { authTagLength: 16 });
  const ct = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, ct, cipher.getAuthTag()]).toString('base64');
}

function decrypt(buffer: Buffer) {
  const out = Buffer.allocUnsafe(buffer.length);
  for (let i = 0; i < buffer.length; i += 1) out[i] = buffer[i] ^ RESPONSE_KEY[i % RESPONSE_KEY.length];
  return out.toString('utf8');
}

/** zzc signature over the plaintext JSON (verbatim port of zzcSign). */
export function zzcSign(payload: string) {
  const hash = createHash('sha1').update(payload).digest('hex').toUpperCase();
  const part1 = [23, 14, 6, 36, 16, 40, 7, 19].filter(i => i < 40).map(i => hash[i]).join('');
  const part2 = [16, 1, 32, 12, 19, 27, 8, 5].map(i => hash[i]).join('');
  const scramble = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179];
  const part3 = Buffer.from(scramble.map((value, i) => value ^ Number.parseInt(hash.slice(i * 2, i * 2 + 2), 16)))
    .toString('base64')
    .replace(/[/+=]/g, '');
  return `zzc${part1}${part3}${part2}`.toLowerCase();
}

export class QQError extends CatalogError {
  constructor(message: string, status = 502, public readonly code?: number) {
    super(message, status);
  }
}

/** Logged-in QQ session cookie values (uin + qm_keyst), when present. */
function auth() {
  const cookie = session.get('qq')?.cookie;
  const uin = cookie?.uin?.replace(/^o0*/, '') ?? '';
  return uin && cookie?.qm_keyst ? { uin, key: cookie.qm_keyst } : null;
}

/** g_tk from the music key (hash33), used by some write endpoints. */
function gtk(key: string) {
  let hash = 5381;
  for (let i = 0; i < key.length; i += 1) hash += (hash << 5) + key.charCodeAt(i);
  return hash & 0x7fffffff;
}

type Raw = Record<string, unknown>;

/**
 * One call to the encrypted unified gateway (musics.fcg, ag-1). Several
 * module/method pairs can be batched; each result comes back under its key.
 */
export async function qqBatch(requests: Record<string, { module: string; method: string; param: Raw }>, options: { auth?: boolean } = {}) {
  const login = options.auth === false ? null : auth();
  const body: Raw = {
    comm: {
      cv: 4747474, ct: 24, format: 'json', inCharset: 'utf-8', outCharset: 'utf-8', notice: 0, platform: 'yqq.json', needNewCode: 1,
      uin: login ? Number(login.uin) : 0,
      g_tk_new_20200303: login ? gtk(login.key) : 5381,
      g_tk: login ? gtk(login.key) : 5381,
      ...(login ? { authst: login.key } : {}),
    },
    ...requests,
  };
  const json = JSON.stringify(body);
  let response: Response;
  try {
    response = await fetch(`https://u6.y.qq.com/cgi-bin/musics.fcg?_=${Date.now()}&encoding=ag-1&sign=${zzcSign(json)}`, {
      method: 'POST',
      body: encrypt(json),
      headers: {
        'Content-Type': 'text/plain',
        Accept: 'application/octet-stream',
        Referer: 'https://y.qq.com/',
        'User-Agent': UA,
        ...(login ? { Cookie: `uin=o${login.uin}; qm_keyst=${login.key}; qqmusic_key=${login.key}` } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new QQError(timedOut ? 'QQ 音乐请求超时，请稍后重试' : '无法连接 QQ 音乐，请检查网络', 504);
  }
  if (!response.ok) throw new QQError(`QQ 音乐返回异常状态（${response.status}）`);
  let parsed: Raw;
  try { parsed = JSON.parse(decrypt(Buffer.from(await response.arrayBuffer()))) as Raw; } catch { throw new QQError('QQ 音乐返回了无法解析的数据'); }
  if (Number(parsed.code) !== 0) throw new QQError(`QQ 音乐接口错误（${String(parsed.code)}）`);
  return parsed;
}

/** Single module/method call; returns `data`, throwing on a non-zero sub-code. */
export async function qqRequest<T = Raw>(module: string, method: string, param: Raw, options: { auth?: boolean; okCodes?: number[] } = {}): Promise<T> {
  const parsed = await qqBatch({ req_0: { module, method, param } }, options);
  const result = (parsed.req_0 ?? {}) as Raw;
  const code = Number(result.code ?? 0);
  if (code !== 0 && !options.okCodes?.includes(code)) {
    if (code === 1000) throw new QQError('请先登录 QQ 音乐账号', 401, code);
    throw new QQError(`QQ 音乐接口错误（${code}）`, 502, code);
  }
  return (result.data ?? {}) as T;
}

/** Plain JSON GET for the legacy c.y.qq.com endpoints (search suggest, playlist search). */
export async function qqLegacy<T = Raw>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Referer: 'https://y.qq.com/', 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  } catch {
    throw new QQError('无法连接 QQ 音乐，请检查网络', 504);
  }
  if (!response.ok) throw new QQError(`QQ 音乐返回异常状态（${response.status}）`);
  const text = await response.text();
  // Some endpoints answer JSONP even with format=json.
  const json = text.trim().replace(/^[\w.]+\(([\s\S]*)\);?$/, '$1');
  try { return JSON.parse(json) as T; } catch { throw new QQError('QQ 音乐返回了无法解析的数据'); }
}
