import { CatalogError } from './errors';
import { SOURCE_NAMES } from './ids';
import { kugouProvider } from './kugou/provider';
import { neteaseProvider } from './netease/provider';
import { NeteaseError } from './netease/client';
import { qqProvider } from './qq/provider';
import type { AccountProvider, CatalogProvider, CatalogSource } from './types';

// The UI picks one in 设置 › 曲库; queued songs keep their own platform.
const providers: Record<CatalogSource, CatalogProvider> = {
  netease: neteaseProvider,
  qq: qqProvider,
  kugou: kugouProvider,
};

export const DEFAULT_SOURCE: CatalogSource = 'netease';

/** Account API of the chosen platform; throws if that platform has no login support. */
export function account(source: string | null | undefined): AccountProvider {
  const provider = catalog(source);
  if (!provider.account) throw new CatalogError(`${SOURCE_NAMES[provider.source]}暂不支持账号登录`, 400);
  return provider.account;
}

/** Parse a JSON request body with a size cap. */
export async function readJson<T>(request: Request, maxBytes = 16 * 1024): Promise<T> {
  const text = await request.text();
  if (text.length > maxBytes) throw new CatalogError('请求内容过长', 413);
  try { return JSON.parse(text || '{}') as T; } catch { throw new CatalogError('请求内容应为 JSON', 400); }
}

/** Account mutations must not be served from cache: drop keys with this prefix. */
export function invalidate(prefix: string) {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

export function catalog(source: string | null | undefined): CatalogProvider {
  const key = (source || DEFAULT_SOURCE) as CatalogSource;
  const provider = providers[key];
  if (!provider) throw new CatalogError('未知的曲库来源', 400);
  return provider;
}

export { CatalogError } from './errors';

// Short-lived cache collapses duplicate requests (e.g. React strict mode, quick tab flips). Failures are never cached.
const cache = new Map<string, { expires: number; value: Promise<unknown> }>();
export function cached<T>(key: string, load: () => Promise<T>, ttlMs = 5 * 60_000): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  const value = load().catch(error => {
    if (cache.get(key)?.value === value) cache.delete(key);
    throw error;
  });
  cache.set(key, { expires: Date.now() + ttlMs, value });
  return value;
}

export async function respond(load: () => Promise<unknown>) {
  try {
    return Response.json(await load(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const known = error instanceof CatalogError || error instanceof NeteaseError;
    const status = known ? error.status : 502;
    const message = known ? error.message : '曲库服务暂时不可用，请稍后重试';
    if (!known) console.error('[catalog]', error);
    return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export function intParam(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new CatalogError('分页参数超出允许范围', 400);
  return parsed;
}
