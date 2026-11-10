'use client';

import { PictureInPicture2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { settings, useSettings } from '@/lib/settings';
import { Row, Section, Switch } from '../controls';
import { isDesktop, keysOf, setter } from '../shared';

/** 设置 › 迷你模式 */
export function MiniSection() {
  const s = useSettings();
  const desktop = isDesktop();
  return (
    <Section id="mini" icon={<PictureInPicture2 size={17} strokeWidth={1.6} />} title="迷你模式" description="悬浮播放条" onReset={() => settings.reset(keysOf('miniShowLyrics', 'miniSpinRecord'))}>
      <Row title="显示滚动歌词" description="关闭时显示歌手名">
        <Switch checked={s.miniShowLyrics} onChange={setter('miniShowLyrics')} label="迷你模式显示歌词" />
      </Row>
      <Row title="唱片旋转" description="播放时封面唱片缓慢旋转">
        <Switch checked={s.miniSpinRecord} onChange={setter('miniSpinRecord')} label="唱片旋转" />
      </Row>
      <Row title="进入迷你模式">
        <Button icon={<PictureInPicture2 size={15} strokeWidth={1.5} />} onClick={() => window.coco?.window.toggleMini()} disabled={!desktop}>{desktop ? '切换到迷你模式' : '需要桌面客户端'}</Button>
      </Row>
    </Section>
  );
}
