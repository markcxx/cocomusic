'use client';

import { FolderOpen, Gauge, HardDrive, Music4, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigation } from '@/components/layout/navigation';
import { Button, ConfirmDialog, toast } from '@/components/ui';
import { recentPlays } from '@/lib/recent-plays';
import { searchHistory } from '@/lib/search-history';
import { settings, useSettings } from '@/lib/settings';
import { Row, Section, Switch } from '../controls';
import { isDesktop, type AppSettings } from '../shared';
import styles from '../Settings.module.css';

/** 设置 › 本地与数据 */
export function LibrarySection({ app }: { app: AppSettings }) {
  const s = useSettings();
  const { navigate } = useNavigation();
  const desktop = isDesktop();
  const [confirm, setConfirm] = useState<null | 'recent' | 'all'>(null);
  return (
    <>
        <Section id="library" icon={<HardDrive size={17} strokeWidth={1.6} />} title="本地与数据" description="本地音乐、播放记录与应用数据">
          <Row title="本地音乐文件夹" description="管理已添加的文件夹和重新扫描">
            <Button icon={<Music4 size={15} strokeWidth={1.5} />} onClick={() => navigate({ name: 'local' })}>前往本地音乐</Button>
          </Row>
          <Row title="记录搜索历史" description="关闭后不再保存新的搜索关键词">
            <Switch checked={s.rememberSearches} onChange={value => { settings.set('rememberSearches', value); if (!value) searchHistory.clear(); }} label="记录搜索历史" />
          </Row>
          <Row title="搜索历史" description="仅保存在本机，最多 12 条">
            <Button icon={<Trash2 size={15} strokeWidth={1.5} />} onClick={() => { searchHistory.clear(); toast.info('搜索历史已清空'); }}>清空</Button>
          </Row>
          <Row title="最近播放记录" description="仅保存在本机，最多 300 首">
            <Button icon={<Trash2 size={15} strokeWidth={1.5} />} onClick={() => setConfirm('recent')}>清空</Button>
          </Row>
          <Row title="应用数据" description={app.result ? <span className={styles.path} data-tooltip={app.result.info.dataDir}>{app.result.info.dataDir}</span> : '登录信息、本地曲库索引与下载记录都保存在这里'}>
            <Button icon={<FolderOpen size={15} strokeWidth={1.5} />} onClick={() => window.coco?.app?.openDataFolder()} disabled={!desktop}>打开文件夹</Button>
          </Row>
          <Row title="恢复全部默认设置" description="外观、播放、歌词等设置回到初始状态，不影响登录、曲库与下载">
            <Button icon={<Gauge size={15} strokeWidth={1.5} />} onClick={() => setConfirm('all')}>恢复默认</Button>
          </Row>
        </Section>
      <ConfirmDialog
        open={confirm === 'recent'}
        onClose={() => setConfirm(null)}
        title="清空最近播放"
        tone="danger"
        confirmLabel="清空"
        message="将删除本机上的全部播放记录。"
        onConfirm={() => { recentPlays.clear(); toast.info('播放记录已清空'); }}
      />
      <ConfirmDialog
        open={confirm === 'all'}
        onClose={() => setConfirm(null)}
        title="恢复全部默认设置"
        confirmLabel="恢复"
        message="外观、播放、歌词、桌面歌词、迷你模式和快捷键设置将回到初始状态。"
        onConfirm={() => { settings.reset(); toast.success('已恢复默认设置'); }}
      />
    </>
  );
}
