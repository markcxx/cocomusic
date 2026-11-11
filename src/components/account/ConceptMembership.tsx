'use client';

import { useEffect, useState } from 'react';
import { Button, toast } from '@/components/ui';
import { CONCEPT_CLAIMED_EVENT } from '@/lib/account-events';
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
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener('focus', refresh);
    window.addEventListener(CONCEPT_CLAIMED_EVENT, refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener(CONCEPT_CLAIMED_EVENT, refresh);
    };
  }, []);
  // Expire the button's previous-day state even if settings stays open overnight.
  useEffect(() => {
    if (!value?.claimedDay) return;
    const tomorrow = Date.parse(value.claimedDay + 'T00:00:00+08:00') + 86_400_000;
    const timer = window.setTimeout(() => { setValue(null); setRevision(n => n + 1); }, Math.max(0, tomorrow - Date.now()));
    return () => window.clearTimeout(timer);
  }, [value?.claimedDay]);
  const claim = async () => {
    setBusy(true);
    try {
      const data = await accountApi.claimMembership();
      setValue(data); setError('');
      toast.success(data.refreshError ? '今日权益已领取，会员信息暂未刷新' : '今日权益已领取');
      window.dispatchEvent(new Event(ACCOUNT_RECHECK_EVENT));
    } catch (error) { toast.error(error instanceof Error ? error.message : '领取失败'); }
    finally { setBusy(false); }
  };
  const claimed = Boolean(value?.claimedDay);
  let description = '正在查询概念版会员信息';
  if (value) {
    const tier = value.vipType === 6 ? '超级 VIP' : value.vipType && value.vipType > 0 ? '已开通会员权益' : undefined;
    const activity = claimed ? '今日活动权益已领取' : undefined;
    const membership = tier ? tier + (value.expiresAt ? `，到期时间：${value.expiresAt}` : '') : undefined;
    description = [activity, membership].filter(Boolean).join('；') || '暂未查到有效会员权益';
    if (value.refreshError) description += `；会员信息刷新失败：${value.refreshError}`;
  }
  return <Row title="概念版会员" description={error || description}>
    <KugouVerificationDialog />
    <Button variant="ghost" onClick={() => setRevision(value => value + 1)} disabled={busy}>刷新</Button>
    <Button onClick={() => void claim()} disabled={busy || claimed || (!value && !error)}>{claimed ? '今日已领取' : busy ? '领取中…' : '领取今日权益'}</Button>
  </Row>;
}
