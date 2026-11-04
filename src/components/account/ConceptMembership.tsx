'use client';

import { useEffect, useState } from 'react';
import { Button, toast } from '@/components/ui';
import { accountApi, ACCOUNT_RECHECK_EVENT } from '@/lib/account-client';
import { Row } from '@/components/settings/controls';
import type { ConceptMembership as Membership } from '@/server/music/kugou/membership';
import { KugouVerificationDialog } from './KugouVerificationDialog';

export function ConceptMembership({ userId }: { userId: string }) {
  const [value, setValue] = useState<Membership | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    accountApi.membership(controller.signal).then(data => { if (!controller.signal.aborted) { setValue(data); setError(''); } }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '查询失败'); });
    return () => controller.abort();
  }, [userId, revision]);
  const claim = async () => {
    setBusy(true);
    try {
      const data = await accountApi.claimMembership();
      setValue(data); setError('');
      toast.success('领取请求已完成，会员信息已刷新');
      window.dispatchEvent(new Event(ACCOUNT_RECHECK_EVENT));
    } catch (error) { toast.error(error instanceof Error ? error.message : '领取失败'); }
    finally { setBusy(false); }
  };
  const description = error || (value
    ? `${value.vipType === undefined ? '暂未查到会员状态' : value.vipType === 6 ? '超级 VIP' : value.vipType > 0 ? '已开通会员权益' : '暂无会员权益'}${value.expiresAt ? `；到期时间：${value.expiresAt}` : ''}。活动资格和可用音质以平台返回为准`
    : '正在查询概念版会员信息');
  return <Row title="概念版会员" description={description}>
    <KugouVerificationDialog />
    <Button variant="ghost" onClick={() => setRevision(value => value + 1)} disabled={busy}>刷新</Button>
    <Button onClick={() => void claim()} disabled={busy}>{busy ? '领取中…' : '领取今日权益'}</Button>
  </Row>;
}
