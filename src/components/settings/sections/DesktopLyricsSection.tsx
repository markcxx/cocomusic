'use client';

import { Mic2 } from 'lucide-react';
import { Button, toast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { desktopLyricColor, LYRIC_COLORS, settings, useSettings } from '@/lib/settings';
import { ThemeColorControl } from '../ColorPicker';
import { Range, Row, Section, Segmented, Switch } from '../controls';
import { isDesktop, keysOf, setter } from '../shared';
import styles from '../Settings.module.css';

const LYRIC_PRESETS = (Object.keys(LYRIC_COLORS) as Array<keyof typeof LYRIC_COLORS>).map(id => ({ label: LYRIC_COLORS[id].label, color: LYRIC_COLORS[id].to }));

/** 设置 › 桌面歌词 */
export function DesktopLyricsSection() {
  const s = useSettings();
  const desktopColor = desktopLyricColor(s);
  const desktop = isDesktop();
  const previewDesktopLyrics = () => {
    if (!window.coco?.lyrics) { toast.info('桌面歌词需要在桌面客户端中使用'); return; }
    window.coco.lyrics.setDesktop(true);
  };
  return (
    <Section id="desktop-lyrics" icon={<Mic2 size={17} strokeWidth={1.6} />} title="桌面歌词" description="悬浮在桌面上的歌词样式，修改后立即同步" onReset={() => settings.reset(keysOf('desktopFontSize', 'desktopColor', 'desktopCustomColor', 'desktopShowTranslation', 'desktopSecondLine', 'desktopKaraoke', 'desktopStroke', 'desktopAlign', 'desktopFontWeight'))}>
      <div className={styles.lyricPreview} style={{ '--from': desktopColor.from, '--to': desktopColor.to, '--weight': s.desktopFontWeight, '--size': `${Math.min(s.desktopFontSize, 40)}px`, textAlign: s.desktopAlign } as React.CSSProperties} aria-hidden>
        <p className={cn(styles.lyricPreviewMain, !s.desktopStroke && styles.noStroke)}>
          <span className={styles.lyricPreviewBase}>难以忘记初次见你</span>
          <span className={styles.lyricPreviewFill} style={{ clipPath: `inset(0 ${s.desktopKaraoke ? 45 : 0}% 0 0)` }}>难以忘记初次见你</span>
        </p>
        {s.desktopSecondLine !== 'none' && <p className={cn(styles.lyricPreviewSub, !s.desktopStroke && styles.noStroke)}>{s.desktopSecondLine === 'translation' && s.desktopShowTranslation ? 'Hard to forget the first time I saw you' : '一双迷人的眼睛'}</p>}
      </div>
      <Row title="歌词颜色" description="已唱部分的颜色，最后一个色块可用调色板自定义">
        <ThemeColorControl
          label="歌词颜色"
          value={desktopColor.to}
          presets={LYRIC_PRESETS}
          onChange={hex => {
            const preset = (Object.keys(LYRIC_COLORS) as Array<keyof typeof LYRIC_COLORS>).find(id => LYRIC_COLORS[id].to.toLowerCase() === hex.toLowerCase());
            if (preset) settings.set('desktopColor', preset);
            else { settings.set('desktopCustomColor', hex.toLowerCase()); settings.set('desktopColor', 'custom'); }
          }}
        />
      </Row>
      <Row title="字号" description="也可以在桌面歌词上用 − / + 调整">
        <Range value={s.desktopFontSize} min={20} max={64} step={2} onChange={setter('desktopFontSize')} label="桌面歌词字号" format={value => `${value}px`} />
      </Row>
      <Row title="字重">
        <Segmented value={s.desktopFontWeight} onChange={setter('desktopFontWeight')} label="字重" options={[{ value: 500, label: '常规' }, { value: 700, label: '粗体' }, { value: 900, label: '特粗' }]} />
      </Row>
      <Row title="对齐方式">
        <Segmented value={s.desktopAlign} onChange={setter('desktopAlign')} label="桌面歌词对齐" options={[{ value: 'left', label: '左' }, { value: 'center', label: '居中' }, { value: 'right', label: '右' }]} />
      </Row>
      <Row title="第二行" description="当前歌词下方显示的内容">
        <Segmented value={s.desktopSecondLine} onChange={setter('desktopSecondLine')} label="第二行" options={[{ value: 'translation', label: '翻译优先' }, { value: 'next', label: '下一句' }, { value: 'none', label: '不显示' }]} />
      </Row>
      <Row title="显示翻译">
        <Switch checked={s.desktopShowTranslation} onChange={setter('desktopShowTranslation')} label="桌面歌词显示翻译" />
      </Row>
      <Row title="逐字高亮" description="像卡拉 OK 一样随演唱进度填充颜色">
        <Switch checked={s.desktopKaraoke} onChange={setter('desktopKaraoke')} label="逐字高亮" />
      </Row>
      <Row title="文字描边" description="浅色壁纸上更清晰">
        <Switch checked={s.desktopStroke} onChange={setter('desktopStroke')} label="文字描边" />
      </Row>
      <Row title="打开桌面歌词">
        <Button icon={<Mic2 size={15} strokeWidth={1.5} />} onClick={previewDesktopLyrics} disabled={!desktop}>{desktop ? '显示桌面歌词' : '需要桌面客户端'}</Button>
      </Row>
    </Section>
  );
}
