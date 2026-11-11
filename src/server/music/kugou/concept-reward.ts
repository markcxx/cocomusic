import { CatalogError } from '../errors';
import { session } from '../session';
import { createKugouClient } from './client';

export const conceptClient = createKugouClient('kugou-lite');
export function requireConceptLogin() {
  const login = session.get('kugou-lite');
  if (!login?.cookie.userid || !login.cookie.token) throw new CatalogError('请先登录酷狗概念版账号', 401);
  return login.cookie.userid;
}

/** Activity dates use China time even when the desktop is running abroad. */
export function conceptToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export async function claimConceptReward(userid: string, day: string) {
  if (requireConceptLogin() !== userid) throw new CatalogError('当前账号已切换，请刷新后重试', 409);
  const result = await conceptClient.kugouRequest({ method: 'POST', path: '/youth/v1/recharge/receive_vip_listen_song', params: { source_id: 90139, receive_day: day }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (Number(result.status) !== 1) throw new CatalogError('平台未确认领取成功，请刷新会员状态后重试', 502);
}
