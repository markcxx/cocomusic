'use client';

import { CircleArrowUp, RefreshCw, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui';
import { formatBytes, updateDialog, updates, useUpdateState } from '@/components/updates/update-store';
import { Row, Section, Segmented, Switch } from '../controls';
import styles from '../Settings.module.css';

const timeAgo = (at: number) => {
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} 小时前`;
  return new Date(at).toLocaleDateString('zh-CN');
};

/** 设置 › 更新: status line + the one action that fits it. */
function UpdateStatusRow({ state }: { state: CocoUpdateState | null }) {
  if (!state) return <Row title="检查更新" description="需要在桌面客户端中使用" disabled><Button disabled>检查更新</Button></Row>;
  const { status, update, progress } = state;
  const description = status === 'checking' ? '正在连接 GitHub…'
    : status === 'error' ? state.error
    : status === 'downloading' && progress ? `正在下载 ${update?.version}：${formatBytes(progress.received)} / ${formatBytes(progress.total)}`
    : status === 'ready' ? `${update?.version} 已下载并通过校验，${state.install === 'restart' ? '重启后完成更新' : '打开安装包即可安装'}`
    : update ? `发现新版本 ${update.version}（${formatBytes(update.size)}）${update.version === state.skipped ? '，已跳过此版本' : ''}`
    : status === 'latest' ? `已是最新版本 · ${state.lastCheck ? `${timeAgo(state.lastCheck)}检查` : ''}`
    : `当前版本 ${state.current}`;
  return (
    <Row title="检查更新" description={description}>
      <div className={styles.inline}>
        {update && <Button variant="primary" icon={<CircleArrowUp size={15} strokeWidth={1.5} />} onClick={() => { updateDialog.show('update'); if (status !== 'ready' && status !== 'downloading') updates.download(); }}>{status === 'ready' ? '安装更新' : status === 'downloading' ? '查看下载进度' : status === 'error' ? '重新下载' : '立即下载'}</Button>}
        <Button icon={<RefreshCw size={15} strokeWidth={1.5} className={status === 'checking' ? styles.spinning : undefined} />} onClick={() => void updates.check()} disabled={status === 'checking' || status === 'downloading'}>
          {status === 'checking' ? '检查中' : '检查更新'}
        </Button>
      </div>
    </Row>
  );
}

/** 设置 › 更新 */
export function UpdatesSection() {
  const update = useUpdateState();
  return (
    <Section id="updates" icon={<CircleArrowUp size={17} strokeWidth={1.6} />} title="更新" description="从 GitHub Releases 获取新版本与更新日志">
      <UpdateStatusRow state={update} />
      <Row title="自动检查更新" description="启动后和每隔 6 小时检查，发现新版本时弹窗，由你选择下载或跳过" disabled={!update}>
        <Switch checked={Boolean(update?.settings.autoCheck)} onChange={value => void updates.setSettings({ autoCheck: value })} label="自动检查更新" disabled={!update} />
      </Row>
      <Row title="更新渠道" description="预览版包含尚在测试的新功能，可能不够稳定" disabled={!update}>
        <Segmented value={update?.settings.channel ?? 'stable'} onChange={value => void updates.setSettings({ channel: value })} label="更新渠道" options={[{ value: 'stable', label: '正式版' }, { value: 'beta', label: '预览版' }]} />
      </Row>
      <Row title="更新日志" description="每个版本的新功能、改进与修复">
        <Button icon={<ScrollText size={15} strokeWidth={1.5} />} onClick={() => updateDialog.show('changelog')} disabled={!update}>查看</Button>
      </Row>
    </Section>
  );
}
