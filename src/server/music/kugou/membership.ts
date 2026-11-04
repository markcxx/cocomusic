import { CatalogError } from '../errors';
import { session } from '../session';
import { createKugouClient } from './client';
import { num, record, rows, text } from './mappers';

export interface ConceptMembership {
  vipType?: number;
  expiresAt?: string;
  records: Array<{ date: string; status?: string }>;
}

const client = createKugouClient('kugou-lite');
function requireLogin() {
  const login = session.get('kugou-lite');
  if (!login?.cookie.userid || !login.cookie.token) throw new CatalogError('请先登录酷狗概念版账号', 401);
  return login.cookie.userid;
}

export async function conceptMembership(): Promise<ConceptMembership> {
  requireLogin();
  const [vip, history] = await Promise.all([
    client.kugouRequest({ base: 'https://kugouvip.kugou.com', path: '/v1/get_union_vip', params: { busi_type: 'concept', opt_product_types: 'dvip,qvip', product_type: 'svip' } }),
    client.kugouRequest({ path: '/youth/v1/activity/get_month_vip_record', params: { latest_limit: 100 } }),
  ]);
  const data = record(vip.data);
  if (Number(vip.status) !== 1 || Number(history.status) !== 1) throw new CatalogError('概念版会员服务未返回有效结果', 502);
  const historyData = record(history.data);
  const list = Array.isArray(history.data) ? rows(history.data) : rows(historyData.records ?? historyData.list ?? historyData.info);
  return {
    vipType: num(data.vip_type),
    expiresAt: text(data.vip_end_time ?? data.end_time ?? data.expire_time) || undefined,
    records: list.map(item => ({ date: text(item.receive_day ?? item.date ?? item.day), status: text(item.status) || undefined })).filter(item => item.date),
  };
}

/** Activity dates use China time even when the desktop is running abroad. */
export function conceptToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const claims = new Map<string, Promise<ConceptMembership>>();
export async function claimConceptReward() {
  requireLogin();
  const result = await client.kugouRequest({ method: 'POST', path: '/youth/v1/recharge/receive_vip_listen_song', params: { source_id: 90139, receive_day: conceptToday() }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (Number(result.status) !== 1) throw new CatalogError('平台未确认领取成功，请刷新会员状态后重试', 502);
}
/** User-initiated, today's date only. Coalesce double clicks; do not simulate listening or ads. */
export function claimConceptMembership() {
  const userid = requireLogin();
  const key = `${userid}:${conceptToday()}`;
  const pending = claims.get(key);
  if (pending) return pending;
  const claim = (async () => {
    await claimConceptReward();
    return conceptMembership();
  })().finally(() => claims.delete(key));
  claims.set(key, claim);
  return claim;
}
