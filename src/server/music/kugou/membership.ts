import { CatalogError } from '../errors';
import { claimedOn, runConceptCheckIn } from './auto-check-in';
import { conceptClient as client, conceptToday, requireConceptLogin } from './concept-reward';
import { num, record, rows, text } from './mappers';

export { conceptToday } from './concept-reward';

export interface ConceptMembership {
  claimedDay?: string;
  refreshError?: string;
  vipType?: number;
  expiresAt?: string;
  records: Array<{ date: string; status?: string }>;
}

export async function conceptMembership(): Promise<ConceptMembership> {
  const userid = requireConceptLogin();
  const day = conceptToday();
  try {
    const membership = await queryMembership(day);
    return { ...membership, claimedDay: claimedOn(userid, day) ? day : membership.claimedDay };
  } catch (error) {
    if (!claimedOn(userid, day)) throw error;
    return { records: [], claimedDay: day, refreshError: error instanceof Error ? error.message : '会员信息刷新失败' };
  }
}

async function queryMembership(day: string): Promise<ConceptMembership> {
  const [vip, history] = await Promise.all([
    client.kugouRequest({ base: 'https://kugouvip.kugou.com', path: '/v1/get_union_vip', params: { busi_type: 'concept', opt_product_types: 'dvip,qvip', product_type: 'svip' } }),
    client.kugouRequest({ path: '/youth/v1/activity/get_month_vip_record', params: { latest_limit: 100 } }),
  ]);
  const data = record(vip.data);
  if (Number(vip.status) !== 1 || Number(history.status) !== 1) throw new CatalogError('概念版会员服务未返回有效结果', 502);
  const historyData = record(history.data);
  const list = Array.isArray(history.data) ? rows(history.data) : rows(historyData.records ?? historyData.list ?? historyData.info);
  return {
    claimedDay: list.some(item => text(item.day ?? item.receive_day ?? item.date) === day && num(item.receive_vip) === 1) ? day : undefined,
    vipType: num(data.vip_type),
    expiresAt: text(data.vip_end_time ?? data.end_time ?? data.expire_time) || undefined,
    records: list.map(item => ({ date: text(item.receive_day ?? item.date ?? item.day), status: text(item.receive_vip ?? item.status) || undefined })).filter(item => item.date),
  };
}

/** Manual retries and automatic check-ins share the account/day receipt and in-flight request. */
export async function claimConceptMembership() {
  const userid = requireConceptLogin();
  const result = await runConceptCheckIn(userid, true);
  if (result.status !== 'success' && result.status !== 'already-done') {
    throw Object.assign(new CatalogError(result.message, result.httpStatus), { verificationUrl: result.verificationUrl });
  }
  if (requireConceptLogin() !== userid) throw new CatalogError('当前账号已切换，请刷新后重试', 409);
  return conceptMembership();
}
