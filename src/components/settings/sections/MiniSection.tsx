'use client';

import { Disc3, Mic2, PanelRightClose, PictureInPicture2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { settings, useSettings } from '@/lib/settings';
import { Row, Section, Switch } from '../controls';
import { isDesktop, keysOf, setter } from '../shared';

/** 设置 › 迷你模式 */
export function MiniSection() {
  const s = useSettings();
  const desktop = isDesktop();
  return (
    <Section id="mini" icon={<PictureInPicture2 size={17} strokeWidth={1.6} />} title="迷你模式" description="悬浮播放条" onReset={() => settings.reset(keysOf('miniShowLyrics', 'miniSpinRecord', 'miniEdgeDock'))}>
      <Row icon={<Mic2 size={16} strokeWidth={1.5} />} title="显示滚动歌词" description="关闭时显示歌手名">
        <Switch checked={s.miniShowLyrics} onChange={setter('miniShowLyrics')} label="迷你模式显示歌词" />
      </Row>
      <Row icon={<Disc3 size={16} strokeWidth={1.5} />} title="唱片旋转" description="播放时封面唱片缓慢旋转">
        <Switch checked={s.miniSpinRecord} onChange={setter('miniSpinRecord')} label="唱片旋转" />
      </Row>
      <Row icon={<PanelRightClose size={16} strokeWidth={1.5} />} title="边缘磁吸黑胶耳" description="拖至屏幕左右边缘或点击右上角贴边按钮时，自动收起为半露旋转黑胶唱片，鼠标移入即刻展开">
        <Switch checked={s.miniEdgeDock} onChange={setter('miniEdgeDock')} label="边缘磁吸黑胶耳" />
      </Row>
      <Row icon={<PictureInPicture2 size={16} strokeWidth={1.5} />} title="进入迷你模式">
        <Button icon={<PictureInPicture2 size={15} strokeWidth={1.5} />} onClick={() => window.coco?.window.toggleMini()} disabled={!desktop}>{desktop ? '切换到迷你模式' : '需要桌面客户端'}</Button>
      </Row>
    </Section>
  );
}
