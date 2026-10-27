import { randomUUID } from 'node:crypto';
import { QQError } from './client';

/**
 * QQ 扫码登录: a port of multiPlatformMusicApi platforms/qqmusic/util/qq_qr_login_2step.js.
 *
 * 1. ptlogin2 serves a QR (cookie qrsig → ptqrtoken = hash33(qrsig)).
 * 2. Poll ptqrlogin: 66 waiting · 67 scanned · 0 success (gives a check_sig URL) · else expired.
 * 3. Follow check_sig (sets p_skey for graph.qq.com), authorize QQ Music's QQ-connect app
 *    (POST graph.qq.com/oauth2.0/authorize → 302 with ?code=), then exchange the code
 *    via QQConnectLogin.LoginServer/QQLogin for musicid + musickey (= uin + qm_keyst).
 *
 * Each login keeps its own small cookie jar in memory; finished or abandoned sessions are dropped.
 */

const APPID = 716027609;
const DAID = 383;
const PT_3RD_AID = 100497308;
const S_URL = 'https://graph.qq.com/oauth2.0/login_jump';
const YQQ_REDIRECT_URI = `https://y.qq.com/portal/wx_redirect.html?login_type=1&surl=${encodeURIComponent('https://y.qq.com/?ADTAG=myqq#type=index')}`;
const XLOGIN_URL = `https://xui.ptlogin2.qq.com/cgi-bin/xlogin?appid=${APPID}&daid=${DAID}&style=33&login_text=%E7%99%BB%E5%BD%95&hide_title_bar=1&hide_border=1&target=self&s_url=${encodeURIComponent(S_URL)}&pt_3rd_aid=${PT_3RD_AID}&pt_feedback_link=${encodeURIComponent(`https://support.qq.com/products/77942?customInfo=.appid${PT_3RD_AID}`)}&theme=2&verify_theme=`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const HARD_TTL = 130_000;
const IDLE_TTL = 20_000;

/** Minimal cookie jar: name → value per registrable domain suffix (enough for this flow). */
class Jar {
  private cookies = new Map<string, { value: string; domain: string }>();
  set(header: string, url: string) {
    const [pair, ...attrs] = header.split(';');
    const eq = pair.indexOf('=');
    if (eq <= 0) return;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const domainAttr = attrs.map(item => item.trim()).find(item => /^domain=/i.test(item));
    const domain = (domainAttr ? domainAttr.slice(7) : new URL(url).hostname).replace(/^\./, '').toLowerCase();
    // Expired/cleared cookies come back empty.
    if (!value) { this.cookies.delete(`${domain}|${name}`); return; }
    this.cookies.set(`${domain}|${name}`, { value, domain });
  }
  header(url: string) {
    const host = new URL(url).hostname.toLowerCase();
    const parts: string[] = [];
    for (const [key, cookie] of this.cookies) {
      if (host === cookie.domain || host.endsWith(`.${cookie.domain}`)) parts.push(`${key.split('|')[1]}=${cookie.value}`);
    }
    return parts.join('; ');
  }
  get(name: string, domain: string) {
    for (const [key, cookie] of this.cookies) if (key.endsWith(`|${name}`) && (cookie.domain === domain || domain.endsWith(`.${cookie.domain}`) || cookie.domain.endsWith(domain))) return cookie.value;
    return '';
  }
  setRaw(name: string, value: string, domain: string) { this.cookies.set(`${domain}|${name}`, { value, domain }); }
}

type Session = { jar: Jar; createdAt: number; lastPollAt: number; ptqrtoken?: number; checkSigUrl?: string; busy: boolean };
const sessions = new Map<string, Session>();

function gc() {
  const now = Date.now();
  for (const [key, item] of sessions) if (now - item.createdAt > HARD_TTL || now - item.lastPollAt > IDLE_TTL) sessions.delete(key);
}

const hash33 = (value: string) => { let e = 0; for (let i = 0; i < value.length; i += 1) { e += (e << 5) + value.charCodeAt(i); e &= 0x7fffffff; } return e; };
const gtk = (key: string) => { let hash = 5381; for (let i = 0; i < key.length; i += 1) hash += (hash << 5) + key.charCodeAt(i); return hash & 0x7fffffff; };

/** fetch with the session's cookies and manual redirects (cookies are captured on every hop). */
async function go(session: Session, url: string, init: RequestInit & { maxRedirects?: number } = {}) {
  let current = url;
  let method = init.method ?? 'GET';
  let body = init.body;
  let redirects = init.maxRedirects ?? 5;
  for (;;) {
    const response = await fetch(current, {
      method,
      body,
      redirect: 'manual',
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9', ...(init.headers as Record<string, string>), Cookie: session.jar.header(current) },
      signal: AbortSignal.timeout(20_000),
    });
    for (const cookie of response.headers.getSetCookie?.() ?? []) session.jar.set(cookie, current);
    const location = response.headers.get('location');
    if (redirects > 0 && location && [301, 302, 303, 307, 308].includes(response.status)) {
      current = new URL(location, current).toString();
      if (response.status === 302 || response.status === 303) { method = 'GET'; body = undefined; }
      redirects -= 1;
      continue;
    }
    return { response, url: current };
  }
}

export async function qqQrStart() {
  gc();
  const key = randomUUID().toUpperCase();
  const session: Session = { jar: new Jar(), createdAt: Date.now(), lastPollAt: Date.now(), busy: false };
  sessions.set(key, session);
  await go(session, XLOGIN_URL, { headers: { Referer: 'https://xui.ptlogin2.qq.com/' } });
  const { response } = await go(session, `https://xui.ptlogin2.qq.com/ssl/ptqrshow?appid=${APPID}&e=2&l=M&s=3&d=72&v=4&t=${Math.random()}&daid=${DAID}&pt_3rd_aid=${PT_3RD_AID}&u1=${encodeURIComponent(S_URL)}`, { headers: { Referer: XLOGIN_URL } });
  if (!response.ok) { sessions.delete(key); throw new QQError('获取 QQ 登录二维码失败'); }
  const qrsig = session.jar.get('qrsig', 'ptlogin2.qq.com');
  if (!qrsig) { sessions.delete(key); throw new QQError('获取 QQ 登录二维码失败'); }
  session.ptqrtoken = hash33(qrsig);
  const image = Buffer.from(await response.arrayBuffer()).toString('base64');
  return { key, image: `data:image/png;base64,${image}` };
}

export type QQPollResult =
  | { status: 'waiting' }
  | { status: 'scanned'; nickname?: string }
  | { status: 'expired' }
  | { status: 'success'; cookie: Record<string, string> };

export async function qqQrPoll(key: string): Promise<QQPollResult> {
  gc();
  const session = sessions.get(key);
  if (!session) return { status: 'expired' };
  session.lastPollAt = Date.now();
  if (session.busy) return { status: 'scanned' };

  if (!session.checkSigUrl) {
    const params = new URLSearchParams({
      u1: S_URL, ptqrtoken: String(session.ptqrtoken), ptredirect: '0', h: '1', t: '1', g: '1', from_ui: '1', ptlang: '2052',
      action: `0-0-${Date.now()}`, js_ver: '25100115', js_type: '1', login_sig: session.jar.get('pt_login_sig', 'ptlogin2.qq.com'),
      pt_uistyle: '40', aid: String(APPID), daid: String(DAID), pt_3rd_aid: String(PT_3RD_AID), pt_js_version: '28d22679',
    });
    const { response } = await go(session, `https://xui.ptlogin2.qq.com/ssl/ptqrlogin?${params}`, { headers: { Referer: XLOGIN_URL } });
    const parts = [...(await response.text()).matchAll(/'([^']*)'/g)].map(match => match[1]);
    const code = parts[0];
    if (code === '66') return { status: 'waiting' };
    if (code === '67') return { status: 'scanned' };
    if (code !== '0' || !parts[2]) { sessions.delete(key); return { status: 'expired' }; }
    session.checkSigUrl = parts[2];
  }

  session.busy = true;
  try {
    await go(session, session.checkSigUrl, { headers: { Referer: 'https://xui.ptlogin2.qq.com/' }, maxRedirects: 8 });
    const pskey = session.jar.get('p_skey', 'graph.qq.com');
    const state = Math.random().toString(36).slice(2);
    const ui = session.jar.get('ui', 'graph.qq.com') || randomUUID().toUpperCase();
    session.jar.setRaw('ui', ui, 'graph.qq.com');
    const showUrl = `https://graph.qq.com/oauth2.0/show?${new URLSearchParams({ which: 'Login', display: 'pc', response_type: 'code', client_id: String(PT_3RD_AID), redirect_uri: YQQ_REDIRECT_URI, state, scope: 'get_user_info,get_app_friends' })}`;
    await go(session, showUrl, { headers: { Referer: 'https://graph.qq.com/' } });
    const form = new URLSearchParams({
      response_type: 'code', client_id: String(PT_3RD_AID), redirect_uri: YQQ_REDIRECT_URI, scope: 'get_user_info,get_app_friends', state,
      switch: '', from_ptlogin: '1', src: '1', update_auth: '1', openapi: '1010_1030', g_tk: String(pskey ? gtk(pskey) : 5381), auth_time: String(Date.now()), ui,
    });
    const { response: auth } = await go(session, 'https://graph.qq.com/oauth2.0/authorize', {
      method: 'POST', body: form.toString(), maxRedirects: 0,
      headers: { Origin: 'https://graph.qq.com', Referer: showUrl, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const code = new URL(auth.headers.get('location') ?? '', 'https://graph.qq.com').searchParams.get('code');
    if (!code) throw new QQError('QQ 授权失败，请重新扫码');
    const exchange = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      body: JSON.stringify({ comm: { g_tk: 5381, platform: 'yqq', ct: 24, cv: 0 }, req: { module: 'QQConnectLogin.LoginServer', method: 'QQLogin', param: { code } } }),
      headers: { 'User-Agent': UA, Origin: 'https://y.qq.com/', Referer: 'https://y.qq.com/', 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(20_000),
    });
    const json = await exchange.json().catch(() => null) as { code?: number; req?: { code?: number; data?: Record<string, unknown> } } | null;
    const data = json?.req?.data ?? {};
    const uin = String(data.musicid ?? data.str_musicid ?? '');
    const musickey = String(data.musickey ?? '');
    if (json?.code !== 0 || json?.req?.code !== 0 || !uin || !musickey) throw new QQError('QQ 音乐登录失败，请重新扫码');
    sessions.delete(key);
    return {
      status: 'success',
      cookie: {
        uin, qm_keyst: musickey,
        // Used to renew the key before it expires (qq/auth.ts, music.login.LoginServer/Login).
        ...Object.fromEntries(['openid', 'unionid', 'access_token', 'refresh_token', 'refresh_key', 'encryptUin', 'musickeyCreateTime', 'keyExpiresIn'].map(name => [name, String(data[name] ?? '')]).filter(([, value]) => value)),
        expired_at: String(data.expired_at ?? ''),
      },
    };
  } catch (error) {
    sessions.delete(key);
    if (error instanceof QQError) throw error;
    throw new QQError('QQ 登录失败，请重新扫码');
  } finally {
    session.busy = false;
  }
}
