'use client';

import { Download, FolderCog, FolderOpen } from 'lucide-react';
import { downloads, useDownloads } from '@/components/downloads/download-store';
import { Button, toast } from '@/components/ui';
import { downloadsApi } from '@/lib/local-client';
import { downloadQualities, QUALITY_HINTS } from '@/lib/download-quality';
import { useSettings } from '@/lib/settings';
import { Row, Section, Segmented, Select, Switch } from '../controls';
import { isDesktop, isMac, QUALITIES } from '../shared';
import styles from '../Settings.module.css';

/** 设置 › 下载 */
export function DownloadsSection() {
  const s = useSettings();
  const desktop = isDesktop();
  const { settings: dl, folder } = useDownloads();
  const pickDownloadFolder = async () => {
    const next = await window.coco?.files?.pickFolder();
    if (next) { await downloads.run(() => downloadsApi.setFolder(next)); toast.success('下载目录已更改'); }
  };
  return (
    <Section id="downloads" icon={<Download size={17} strokeWidth={1.6} />} title="下载" description="保存位置、音质与文件命名" onReset={dl ? () => void downloads.updateSettings({ quality: 'exhigh', naming: 'artist-title', lyrics: false, allowTrial: false, concurrency: 2 }) : undefined}>
      <Row title="下载目录" description={<span className={styles.path} data-tooltip={folder}>{folder || '—'}</span>}>
        <div className={styles.inline}>
          {desktop && <Button icon={<FolderOpen size={15} strokeWidth={1.5} />} onClick={() => folder && window.coco?.files?.reveal(folder + (isMac() ? '/' : '\\'))} disabled={!folder}>打开</Button>}
          <Button icon={<FolderCog size={15} strokeWidth={1.5} />} onClick={() => void pickDownloadFolder()} disabled={!desktop}>更改</Button>
        </div>
      </Row>
      <Row title="默认下载音质" description="下载前可重新选择，具体可用音质按当前账号和歌曲权限查询">
        <Select value={dl?.quality ?? 'exhigh'} onChange={value => void downloads.updateSettings({ quality: value })} label="默认下载音质" options={QUALITIES.filter(item => downloadQualities(s.catalogSource).includes(item.value)).map(item => ({ ...item, hint: QUALITY_HINTS[item.value] }))} />
      </Row>
      <Row title="文件命名">
        <Select
          value={dl?.naming ?? 'artist-title'}
          onChange={value => void downloads.updateSettings({ naming: value })}
          label="文件命名"
          options={[{ value: 'artist-title', label: '歌手 - 歌名' }, { value: 'title-artist', label: '歌名 - 歌手' }, { value: 'title', label: '歌名' }]}
        />
      </Row>
      <Row title="同时下载歌词" description="保存为同名 .lrc 文件，其他播放器也能识别">
        <Switch checked={dl?.lyrics ?? false} onChange={value => void downloads.updateSettings({ lyrics: value })} label="同时下载歌词" />
      </Row>
      <Row title="允许下载试听片段" description="作为下载弹窗的默认选项；仅有试听权限时保存片段，并在文件名标注“试听”">
        <Switch checked={dl?.allowTrial ?? false} onChange={value => void downloads.updateSettings({ allowTrial: value })} label="允许下载试听片段" />
      </Row>
      <Row title="同时下载数量">
        <Segmented value={dl?.concurrency ?? 2} onChange={value => void downloads.updateSettings({ concurrency: value })} label="同时下载数量" options={[1, 2, 3, 5].map(value => ({ value, label: String(value) }))} />
      </Row>
    </Section>
  );
}
