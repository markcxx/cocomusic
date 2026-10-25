'use client';

import { CheckCircle2, Download, Loader2 } from 'lucide-react';
import { IconButton } from '@/components/ui';
import type { CatalogTrack } from '@/lib/catalog-client';
import { downloadsApi } from '@/lib/local-client';
import { downloads, jobFor, useDownloads } from './download-store';
import styles from './Downloads.module.css';

/** Per-row download: idle → queued/progress ring → done check. Retry on failure. */
export function DownloadButton({ track }: { track: CatalogTrack }) {
  const { jobs } = useDownloads();
  const job = jobFor(jobs, track.id, track.source);
  if (job?.status === 'done') {
    return <IconButton label="已下载" tone="muted" size="sm" disabled><CheckCircle2 size={16} strokeWidth={1.5} className={styles.doneIcon} /></IconButton>;
  }
  if (job?.status === 'queued' || job?.status === 'downloading') {
    const ratio = job.total ? job.received / job.total : 0;
    return (
      <IconButton label={job.status === 'queued' ? '等待下载' : `下载中 ${Math.round(ratio * 100)}%`} tone="muted" size="sm" onClick={() => void downloads.run(() => downloadsApi.cancel(job.id))} tooltip={job.status === 'queued' ? '等待下载 · 点击取消' : `下载中 ${Math.round(ratio * 100)}% · 点击取消`}>
        {job.status === 'queued' || !job.total
          ? <Loader2 size={15} strokeWidth={1.6} className={styles.spin} />
          : <ProgressRing ratio={ratio} />}
      </IconButton>
    );
  }
  return (
    <IconButton label={job?.status === 'failed' ? '下载失败，点击重试' : '下载'} tone="muted" size="sm" onClick={() => void downloads.add([track])}>
      <Download size={16} strokeWidth={1.4} />
    </IconButton>
  );
}

export function ProgressRing({ ratio, size = 16 }: { ratio: number; size?: number }) {
  const r = 7;
  const circumference = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" className={styles.ring} aria-hidden>
      <circle cx="9" cy="9" r={r} className={styles.ringTrack} />
      <circle cx="9" cy="9" r={r} className={styles.ringFill} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ratio)} />
    </svg>
  );
}
