'use client';

import { useEffect } from 'react';
import { accountApi } from '@/lib/account-client';
import { useSettings } from '@/lib/settings';
import { toast } from '@/components/ui';
import { useAccount } from './account-store';
import { CONCEPT_VERIFIED_EVENT, requestKugouVerification } from '@/lib/kugou-verification';

/** Main window only. Run on launch, enabling the option, login, and returning the next day. */
export function ConceptAutoCheckIn() {
  const enabled = useSettings().conceptAutoCheckIn;
  const { profile } = useAccount();
  const user = profile?.source === 'kugou-lite' ? profile.id : undefined;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let busy = false;
    const run = async (retry = false) => {
      if (busy) return;
      busy = true;
      try {
        const result = await accountApi.autoCheckIn(retry);
        if (!active || !result.attempted) return;
        requestKugouVerification(result.verificationUrl);
        if (result.status === 'success') toast.success(result.message);
        else toast.error(`酷狗概念版自动签到未成功：${result.message}`);
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : '自动签到服务暂不可用');
      } finally { busy = false; }
    };
    void run();
    const onFocus = () => { void run(); };
    const onVerified = () => { void run(true); };
    window.addEventListener('focus', onFocus);
    window.addEventListener(CONCEPT_VERIFIED_EVENT, onVerified);
    return () => { active = false; window.removeEventListener('focus', onFocus); window.removeEventListener(CONCEPT_VERIFIED_EVENT, onVerified); };
  }, [enabled, user]);
  return null;
}
