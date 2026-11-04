'use client';
import { useState } from 'react';
import { Button, Dialog } from '@/components/ui';
import { usePlayer } from '@/components/player/player-store';
import { ACCOUNT_RECHECK_EVENT } from '@/lib/account-client';
import { CONCEPT_VERIFIED_EVENT, dismissKugouVerification, useKugouVerification } from '@/lib/kugou-verification';

/** The user completes the official challenge; the application never solves it. */
export function KugouVerificationDialog() {
  const [open, setOpen] = useState(false);
  const url = useKugouVerification();
  const player = usePlayer();
  const retry = () => {
    setOpen(false);
    dismissKugouVerification();
    window.dispatchEvent(new Event(ACCOUNT_RECHECK_EVENT));
    window.dispatchEvent(new Event(CONCEPT_VERIFIED_EVENT));
    if (player.status === 'error') player.reloadStream();
  };
  return <>{url && <Button variant="ghost" onClick={() => setOpen(true)}>查看平台验证信息</Button>}<Dialog open={open && Boolean(url)} onClose={() => setOpen(false)} title="酷狗返回安全验证要求" width={440}>
    <p>酷狗要求验证本次请求。请打开官方页面，由你完成验证，然后返回应用重试。</p>
    {url && <p><a href={url} target="_blank" rel="noreferrer">打开酷狗官方验证页面</a></p>}
    <Button onClick={retry}>我已完成验证，重试</Button>
  </Dialog></>;
}
