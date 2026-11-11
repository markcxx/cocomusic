'use client';

import { useEffect, useState } from 'react';
import { ConfirmDialog, toast } from '@/components/ui';
import { settings, useSettings, type WindowEffect } from '@/lib/settings';

/** Persist construction changes and offer a restart from any appearance control. */
export function WindowEffectRestartDialog() {
  const effect = useSettings().windowEffect;
  const [pending, setPending] = useState<WindowEffect | null>(null);

  useEffect(() => {
    const bridge = window.coco;
    if (!bridge) return;
    let previous = settings.get().windowEffect;
    let revision = 0;
    let active = true;
    const unsubscribe = settings.subscribe(() => {
      const next = settings.get().windowEffect;
      if (next === previous) return;
      const before = previous;
      previous = next;
      const request = ++revision;
      void bridge.app.setSettings({ transparentWindow: next === 'transparent' }).then(() => {
        if (!active || request !== revision) return;
        const needsRestart = (next === 'transparent') !== (bridge.material === 'transparent');
        setPending(needsRestart ? next : null);
      }).catch(() => {
        if (!active || request !== revision) return;
        previous = before;
        settings.set('windowEffect', before);
        toast.error('窗口效果保存失败，请重试');
      });
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  return (
    <ConfirmDialog
      open={pending !== null && pending === effect}
      onClose={() => setPending(null)}
      title="重启以应用窗口效果"
      message="窗口效果已保存，重启应用后生效。是否现在重启？"
      cancelLabel="稍后重启"
      confirmLabel="立即重启"
      onConfirm={() => window.coco?.app?.relaunch()}
    />
  );
}
