'use client';

import { useEffect } from 'react';
import { toast } from '@/components/ui';
import { storageReady } from '@/lib/me-client';

/** Long enough to read the file path. */
const NOTICE_MS = 15_000;

/**
 * Tells the user when data of an earlier version could not be imported
 * because its file is unreadable. The file is kept and the import runs again
 * on every launch until it succeeds.
 */
export function LegacyDataNotice() {
  useEffect(() => {
    let cancelled = false;
    void storageReady().then(({ unreadable, error }) => {
      if (cancelled) return;
      if (error) toast.error(error, NOTICE_MS);
      if (!unreadable.length) return;
      const files = unreadable.map(item => item.path).join('、');
      toast.error(`旧版数据未能导入：${files} 无法读取。原文件已保留，修复、恢复或删除它后重新打开 CoCo Music 会自动重试。`, NOTICE_MS);
    });
    return () => { cancelled = true; };
  }, []);
  return null;
}
