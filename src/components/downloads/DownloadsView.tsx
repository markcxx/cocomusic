'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { FolderCog, FolderOpen, Play, RotateCw, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Cover } from '@/components/common/Cover';
import { Tabs } from '@/components/common/Tabs';
import { usePlayer } from '@/components/player/player-store';
import { CollapsingHeader, Page, StickyBar } from '@/components/scroll';
import { Button, ConfirmDialog, IconButton, toast } from '@/components/ui';
import { downloadsApi, localToTrack, type DownloadJob } from '@/lib/local-client';
import { cn } from '@/lib/cn';
import type { Track } from '@/types/music';
import { downloads, useDownloads } from './download-store';
import { DownloadsEmpty } from './DownloadsEmpty';
import styles from './Downloads.module.css';

const tabs = ['下载中', '已下载'] as const;
type Tab = (typeof tabs)[number];

const size = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Finished job → playable local track (keeps the NetEase id for likes/comments). */
function jobTrack(job: DownloadJob): Track | null {
  if (job.status !== 'done' || !job.localId) return null;
  return {
    ...localToTrack({ id: job.localId, path: job.path ?? '', title: job.title, artist: job.artist, album: job.album, duration: job.duration, size: job.total, mtime: 0, addedAt: job.createdAt, remoteId: job.songId }),
    // Downloaded files rarely embed art; the catalog cover is the better picture.
    cover: job.cover,
  };
}

function JobState({ job }: { job: DownloadJob }) {
  if (job.status === 'done') {
    return (
      <span className={styles.done}>
        已完成 · {size(job.total)}
        {job.trial && <em className={styles.trialTag} data-tooltip={`仅试听片段（${Math.round(job.trial.end - job.trial.start)} 秒），账号有完整播放权限时可重新下载`}>试听</em>}
      </span>
    );
  }
  if (job.status === 'failed') return <span className={styles.failed} data-tooltip={job.error}>失败：{job.error ?? '未知错误'}</span>;
  if (job.status === 'canceled') return <span>已取消</span>;
  const ratio = job.total ? job.received / job.total : 0;
  return (
    <>
      <span>{job.status === 'queued' ? '等待中' : job.total ? `${size(job.received)} / ${size(job.total)} · ${Math.round(ratio * 100)}%` : '连接中…'}</span>
      <span className={styles.bar}>
        <span className={cn(styles.barFill, (job.status === 'queued' || !job.total) && styles.barIndeterminate)} style={job.total ? { width: `${ratio * 100}%` } : undefined} />
      </span>
    </>
  );
}

/** 下载管理: active queue and finished files. Downloads run in the app server and survive page changes. */
export function DownloadsView() {
  const player = usePlayer();
  const { jobs, folder, loaded, settings: dlSettings } = useDownloads();
  const bridge = typeof window === 'undefined' ? undefined : window.coco?.files;
  const [tab, setTab] = useState<Tab>('下载中');
  const [removing, setRemoving] = useState<DownloadJob | null>(null);

  const activeJobs = useMemo(() => jobs.filter(job => job.status !== 'done'), [jobs]);
  const doneJobs = useMemo(() => jobs.filter(job => job.status === 'done').sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0)), [jobs]);
  const doneTracks = useMemo(() => doneJobs.map(jobTrack).filter((track): track is Track => Boolean(track)), [doneJobs]);
  const list = tab === '下载中' ? activeJobs : doneJobs;
  const running = activeJobs.filter(job => job.status === 'queued' || job.status === 'downloading').length;
  const failed = activeJobs.filter(job => job.status === 'failed').length;

  const changeFolder = async () => {
    const next = await bridge?.pickFolder();
    if (!next) return;
    await downloads.run(() => downloadsApi.setFolder(next));
    toast.success('下载目录已更改，新的下载将保存到这里');
  };

  return (
    <Page gap="sm">
      <CollapsingHeader
        title="下载管理"
        subtitle={loaded ? `${running ? `${running} 首正在下载 · ` : ''}已下载 ${doneJobs.length} 首 · 歌词会一并保存为同名 .lrc 文件` : '正在读取下载列表'}
        actions={(
          <>
            <Button variant="primary" icon={<Play size={15} strokeWidth={0} fill="currentColor" />} disabled={!doneTracks.length} onClick={() => player.play(doneTracks[0], doneTracks)}>播放已下载</Button>
            {bridge && <Button icon={<FolderOpen size={15} strokeWidth={1.5} />} disabled={!folder} onClick={() => doneJobs[0]?.path ? bridge.reveal(doneJobs[0].path) : toast.info(`下载目录：${folder}`)}>打开目录</Button>}
          </>
        )}
      />
      <StickyBar compactTitle="下载管理">
        <div className={styles.toolbar}>
          <Tabs items={tabs} value={tab} onChange={setTab} label="下载分类" size="sm" />
          <span className={styles.folder} data-tooltip={folder}>保存到 <code>{folder || '—'}</code></span>
          {bridge && <IconButton label="更改下载目录" tone="muted" onClick={() => void changeFolder()}><FolderCog size={17} strokeWidth={1.5} /></IconButton>}
          {tab === '下载中' && failed > 0 && <Button variant="ghost" icon={<RotateCw size={14} strokeWidth={1.6} />} onClick={() => void Promise.all(activeJobs.filter(job => job.status === 'failed').map(job => downloadsApi.retry(job.id))).then(() => downloads.refresh())}>全部重试</Button>}
          <Button variant="ghost" icon={<Trash2 size={14} strokeWidth={1.6} />} disabled={!jobs.some(job => job.status !== 'queued' && job.status !== 'downloading')} onClick={() => void downloads.run(downloadsApi.clearFinished)}>清除记录</Button>
        </div>
      </StickyBar>

      {list.length ? (
        <ul className={styles.list}>
          <AnimatePresence initial={false}>
            {list.map(job => {
              const track = jobTrack(job);
              return (
                <motion.li key={job.id} className={styles.job} layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }} onDoubleClick={() => track && player.play(track, doneTracks)}>
                  <Cover seed={`netease:${job.songId}`} src={job.cover} size={44} radius={8} />
                  <span className={styles.names}>
                    <strong data-tooltip={job.title} data-tooltip-overflow>{job.title}</strong>
                    <span>{job.artist}{job.album ? ` · ${job.album}` : ''}</span>
                  </span>
                  <span className={styles.state}><JobState job={job} /></span>
                  <span className={styles.actions}>
                    {track && <IconButton label="播放" size="sm" tone="muted" onClick={() => player.play(track, doneTracks)}><Play size={14} strokeWidth={0} fill="currentColor" /></IconButton>}
                    {job.status === 'done' && bridge && job.path && <IconButton label="在文件夹中显示" size="sm" tone="muted" onClick={() => bridge.reveal(job.path!)}><FolderOpen size={15} strokeWidth={1.5} /></IconButton>}
                    {(job.status === 'failed' || job.status === 'canceled') && <IconButton label="重试" size="sm" tone="muted" onClick={() => void downloads.run(() => downloadsApi.retry(job.id))}><RotateCw size={15} strokeWidth={1.5} /></IconButton>}
                    {(job.status === 'queued' || job.status === 'downloading')
                      ? <IconButton label="取消下载" size="sm" tone="muted" onClick={() => void downloads.run(() => downloadsApi.cancel(job.id))}><X size={15} strokeWidth={1.6} /></IconButton>
                      : <IconButton label={job.status === 'done' ? '删除' : '移除记录'} size="sm" tone="muted" onClick={() => (job.status === 'done' ? setRemoving(job) : void downloads.run(() => downloadsApi.remove(job.id)))}><Trash2 size={15} strokeWidth={1.5} /></IconButton>}
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      ) : (
        <DownloadsEmpty firstTime={loaded && !jobs.length} tab={tab} settings={dlSettings} folder={folder} onChangeFolder={bridge ? () => void changeFolder() : undefined} />
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="删除下载"
        tone="danger"
        confirmLabel="删除文件"
        message={<>删除「{removing?.title}」的下载文件和歌词？本地音乐中也会一并移除。</>}
        onConfirm={async () => {
          if (!removing) return;
          await downloadsApi.remove(removing.id, true);
          await downloads.refresh();
          toast.info('已删除');
        }}
      />
    </Page>
  );
}
