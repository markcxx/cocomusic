import { session } from '../session';
import { qqBatch, qqRequest } from './client';
import { text, type Raw } from './mappers';

/**
 * Keeping the QQ Music login alive. The musickey lasts only a few days; the
 * official clients renew it with music.login.LoginServer/Login (refresh_key +
 * refresh_token from the original login). Endpoints follow L-1124/QQMusicApi
 * modules/login.py (check_expired, refresh_credential).
 *
 * Note: userInfo.BaseUserInfoServer answers for any uin, so it cannot tell
 * whether the key is still valid; GetLoginUserInfo can (code 1000 = expired).
 */

/** Renew this long after the last login/refresh, before the key runs out. */
const REFRESH_AFTER_MS = 12 * 60 * 60_000;
/** Sub-codes meaning the key is no longer accepted. */
const EXPIRED_CODES = new Set([1000, 104400, 104401]);

let refreshing: Promise<boolean> | null = null;

/** true: valid · false: rejected · null: could not tell (offline, gateway error). */
export async function qqLoginValid(): Promise<boolean | null> {
  try {
    const parsed = await qqBatch({ req_0: { module: 'music.UserInfo.userInfoServer', method: 'GetLoginUserInfo', param: {} } });
    const code = Number((parsed.req_0 as Raw | undefined)?.code ?? 0);
    if (code === 0) return true;
    return EXPIRED_CODES.has(code) ? false : null;
  } catch {
    return null;
  }
}

/** Swap the stored key for a fresh one. Resolves false when QQ refuses (or nothing to refresh with). */
export function qqRefreshLogin(): Promise<boolean> {
  refreshing ??= (async () => {
    const cookie = session.get('qq')?.cookie;
    if (!cookie?.uin || !cookie.qm_keyst || !(cookie.refresh_key || cookie.refresh_token)) return false;
    const wechat = cookie.qm_keyst.startsWith('W_X');
    const param: Raw = wechat
      ? { openid: cookie.openid ?? '', refresh_token: cookie.refresh_token ?? '', str_musicid: cookie.uin, musickey: cookie.qm_keyst, unionid: cookie.unionid ?? '', refresh_key: cookie.refresh_key ?? '', loginMode: 2 }
      : { openid: cookie.openid ?? '', access_token: cookie.access_token ?? '', refresh_token: cookie.refresh_token ?? '', expired_in: Number(cookie.expired_at) || 0, musicid: Number(cookie.uin), musickey: cookie.qm_keyst, refresh_key: cookie.refresh_key ?? '', loginMode: 2 };
    try {
      const data = await qqRequest<Raw>('music.login.LoginServer', 'Login', param);
      const musickey = text(data.musickey);
      if (!musickey) return false;
      session.updateCookie('qq', {
        qm_keyst: musickey,
        ...Object.fromEntries(['openid', 'unionid', 'access_token', 'refresh_token', 'refresh_key', 'encryptUin', 'expired_at', 'musickeyCreateTime', 'keyExpiresIn'].map(name => [name, text(data[name])])),
        refreshed_at: String(Date.now()),
      });
      return true;
    } catch {
      return false;
    }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

/** When the key is due for renewal: its own expiry when QQ told us, else a fixed age. */
function refreshDue(cookie: Record<string, string>, savedAt: number) {
  const created = Number(cookie.musickeyCreateTime) * 1000;
  const lifetime = Number(cookie.keyExpiresIn) * 1000;
  if (created && lifetime) return Date.now() > created + lifetime / 2;
  const last = Number(cookie.refreshed_at) || savedAt;
  return Date.now() - last > REFRESH_AFTER_MS;
}

/**
 * Make sure the stored login still works, renewing it when due or rejected.
 * Clears the session (flagged as expired) only when QQ rejects the key and the
 * refresh fails too. 'unknown' = network trouble, keep what we have.
 */
export async function qqEnsureLogin(): Promise<'ok' | 'renewed' | 'expired' | 'unknown' | 'none'> {
  const stored = session.get('qq');
  if (!stored?.cookie.uin || !stored.cookie.qm_keyst) return 'none';
  const renewed = refreshDue(stored.cookie, stored.savedAt) && await qqRefreshLogin();
  const valid = await qqLoginValid();
  if (valid === true) return renewed ? 'renewed' : 'ok';
  if (valid === null) return 'unknown';
  if (await qqRefreshLogin() && (await qqLoginValid()) !== false) return 'renewed';
  session.clear('qq', { expired: true });
  return 'expired';
}
