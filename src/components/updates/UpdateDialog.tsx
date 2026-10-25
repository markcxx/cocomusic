'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Dialog, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ReleaseNotes } from './ReleaseNotes';
import { formatBytes, formatDate, updateDialog, updates, useUpdateDialog, useUpdateState } from './update-store';
import dialogStyles from '@/components/ui/Dialog.module.css';
import styles from './Updates.module.css';

function VersionHeader({ release, current }: { release: CocoReleaseNote; current?: boolean }) {
  return (
    <header className={styles.versionHeader}>
      <strong>{release.version}</strong>
      {release.prerelease && <span className={styles.tag}>预发行</span>}
      {current && <span className={cn(styles.tag, styles.tagCurrent)}>当前版本</span>}
      <span className={styles.date}>{formatDate(release.publishedAt)}</span>
    </header>
  );
}

/** Download / install footer for the offered update. */
function UpdateActions({ state }: { state: CocoUpdateState }) {
  const update = state.update!;
  const { status, progress, install } = state;
  const ratio = progress?.total ? Math.min(1, progress.received / progress.total) : 0;
  return (
    <div className={styles.footer}>
      <AnimatePresence initial={false}>
        {(status === 'downloading' || status === 'ready') && progress && (
          <motion.div className={styles.progress} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <div className={styles.progressText}>
              <span>{status === 'ready' ? '下载完成，已通过 SHA-256 校验' : `正在下载 ${Math.round(ratio * 100)}%`}</span>
              <span>{formatBytes(progress.received)} / {formatBytes(progress.total)}{status === 'downloading' && progress.speed > 0 ? ` · ${formatBytes(progress.speed)}/s` : ''}</span>
            </div>
            <span className={styles.bar}><span className={styles.barFill} style={{ width: `${ratio * 100}%` }} /></span>
          </motion.div>
        )}
      </AnimatePresence>
      {state.status === 'error' && state.error && <p className={dialogStyles.error} role="alert">{state.error}</p>}
      <div className={dialogStyles.actions}>
        {status === 'downloading' ? (
          <button type="button" className={cn(dialogStyles.action, dialogStyles.cancel)} onClick={updates.cancel}>取消下载</button>
        ) : (
          <button type="button" className={cn(dialogStyles.action, dialogStyles.cancel)} onClick={() => { updates.skip(update.version); updateDialog.close(); }} disabled={status === 'ready'}>跳过此版本</button>
        )}
        {status === 'ready' ? (
          <button type="button" className={cn(dialogStyles.action, dialogStyles.confirm)} onClick={updates.install}>{install === 'restart' ? '立即重启并更新' : '打开安装包'}</button>
        ) : (
          <button type="button" className={cn(dialogStyles.action, dialogStyles.confirm)} onClick={updates.download} disabled={status === 'downloading'} aria-busy={status === 'downloading'}>
            {status === 'downloading' && <Spinner size={14} />}
            {status === 'downloading' ? '下载中…' : status === 'error' ? '重新下载' : `立即下载（${formatBytes(update.size)}）`}
          </button>
        )}
      </div>
      {install === 'open' && <p className={styles.hint}>下载完成后，点击“打开安装包”并按系统提示完成安装。</p>}
    </div>
  );
}

function UpdatePane({ state }: { state: CocoUpdateState }) {
  const update = state.update!;
  return (
    <div className={dialogStyles.body}>
      <p className={styles.lead}>
        CoCo Music <strong>{update.version}</strong> 已发布，当前版本 {state.current}。
        {update.changes.length > 1 && ` 以下是跳过的 ${update.changes.length} 个版本的全部更新内容。`}
      </p>
      <div className={styles.scroll}>
        {update.changes.map(release => (
          <article key={release.version} className={styles.release}>
            <VersionHeader release={release} />
            <ReleaseNotes source={release.notes} />
          </article>
        ))}
      </div>
      <UpdateActions state={state} />
    </div>
  );
}

function ChangelogPane({ state }: { state: CocoUpdateState | null }) {
  const [data, setData] = useState<{ releases: CocoReleaseNote[]; error: string } | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    void updates.changelog().then(result => { if (alive) setData(result); });
    return () => { alive = false; };
  }, [reload]);
  const current = state?.current;
  return (
    <div className={dialogStyles.body}>
      <div className={styles.scroll}>
        {!data && <div className={styles.loading}><Spinner />正在读取 GitHub Releases</div>}
        {data?.error && !data.releases.length && (
          <div className={styles.loading}>
            <span>{data.error}</span>
            <button type="button" className={styles.link} onClick={() => { setData(null); setReload(value => value + 1); }}><RefreshCw size={13} strokeWidth={1.8} />重试</button>
          </div>
        )}
        {data?.releases.map(release => (
          <article key={release.version} className={styles.release}>
            <VersionHeader release={release} current={release.version === current} />
            <ReleaseNotes source={release.notes} />
          </article>
        ))}
      </div>
      <div className={dialogStyles.actions}>
        <button type="button" className={cn(dialogStyles.action, dialogStyles.cancel)} onClick={() => window.open('https://github.com/markcxx/cocomusic/releases', '_blank', 'noopener')}>
          <ExternalLink size={14} strokeWidth={1.8} />在 GitHub 查看
        </button>
        {state?.update
          ? <button type="button" className={cn(dialogStyles.action, dialogStyles.confirm)} onClick={() => updateDialog.show('update')}>更新到 {state.update.version}</button>
          : <button type="button" className={cn(dialogStyles.action, dialogStyles.confirm)} onClick={updateDialog.close}>完成</button>}
      </div>
    </div>
  );
}

/**
 * The update and changelog dialogs. Also opens itself once when a background
 * check finds a new version, and shows what's new after the app was updated.
 */
export function UpdateDialog() {
  const state = useUpdateState();
  const open = useUpdateDialog();

  useEffect(() => {
    if (!state) return;
    if (state.notify && state.update?.version === state.notify) { updateDialog.show('update'); updates.dismiss('notify'); }
    else if (state.whatsNew) { updateDialog.show('changelog'); updates.dismiss('whatsNew'); }
  }, [state]);

  const showUpdate = open === 'update' && Boolean(state?.update);
  const title = showUpdate ? '发现新版本' : '更新日志';
  return (
    <Dialog open={showUpdate || open === 'changelog'} onClose={updateDialog.close} title={title} width={560}>
      {showUpdate && state ? <UpdatePane state={state} /> : <ChangelogPane state={state} />}
    </Dialog>
  );
}
