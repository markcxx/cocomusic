'use client';

import { Palette } from 'lucide-react';
import { Button } from '@/components/ui';
import { ACCENT_PRESETS, settings, useSettings, type Settings } from '@/lib/settings';
import { ThemeColorControl } from '../ColorPicker';
import { useResolvedScheme } from '../ApplyAppearance';
import { ChoiceTiles } from '../ChoiceTiles';
import { WindowSketch } from '../WindowSketch';
import { Range, Row, Section, Segmented, Switch } from '../controls';
import { isDesktop, isMac, keysOf, setter, type AppSettings } from '../shared';
import styles from '../Settings.module.css';

const WINDOW_EFFECT_HINTS: Record<string, string> = {
  vibrancy: '系统毛玻璃：背后的桌面被实时模糊后透出来，模糊强度由系统决定',
  acrylic: '系统亚克力：背后的桌面被强模糊并带细微噪点，模糊强度由系统决定',
  mica: '云母：取桌面壁纸的柔和色调（Windows 11），不透出其他窗口',
  transparent: '和桌面歌词一样的真透明窗口：背后的桌面和窗口清晰可见，不做模糊',
  minimal: '简约：浅灰导航栏与播放栏，白色内容卡片，不透明、无毛玻璃',
  none: '不透明窗口',
};

/** 设置 › 外观 */
export function AppearanceSection({ app }: { app: AppSettings }) {
  const s = useSettings();
  const desktop = isDesktop();
  // Transparency is fixed when the window is created: switching to/from 透明 needs a restart.
  const launchedTransparent = typeof window !== 'undefined' && window.coco?.material === 'transparent';
  const shownEffect = s.windowEffect === 'none' || s.windowEffect === 'transparent' || s.windowEffect === 'minimal' ? s.windowEffect
    : isMac() ? 'vibrancy' : s.windowEffect === 'vibrancy' ? 'acrylic' : s.windowEffect;
  const scheme = useResolvedScheme();
  const needsRestart = desktop && (s.windowEffect === 'transparent') !== launchedTransparent;
  const chooseEffect = async (value: Settings['windowEffect']) => {
    settings.set('windowEffect', value);
    await app.update({ transparentWindow: value === 'transparent' });
  };
  return (
    <Section id="appearance" icon={<Palette size={17} strokeWidth={1.6} />} title="外观" description="深浅色、窗口效果、毛玻璃与主题色" onReset={() => settings.reset(keysOf('themeMode', 'windowEffect', 'windowOpacity', 'glassOpacity', 'glassBlur', 'accent', 'reduceMotion', 'zoom'))}>
      <Row title="外观模式" description="跟随系统时，系统切换深浅色会自动同步" vertical>
        {/* Each tile previews the window effect chosen below, in that scheme. */}
        <ChoiceTiles
          value={s.themeMode}
          onChange={setter('themeMode')}
          label="外观模式"
          options={([['system', '跟随系统', 'split'], ['light', '浅色', 'light'], ['dark', '深色', 'dark']] as const).map(([value, label, sketch]) => ({
            value, label, preview: <WindowSketch effect={shownEffect} scheme={sketch} />,
          }))}
        />
      </Row>

      <div className={styles.groupLabel}>窗口</div>
      <Row
        title="窗口效果"
        description={WINDOW_EFFECT_HINTS[shownEffect] ?? WINDOW_EFFECT_HINTS.none}
        vertical
      >
        {/* Materials need the desktop client; 简约 and 不透明 are drawn by the page itself. */}
        <ChoiceTiles
          value={shownEffect}
          onChange={value => void chooseEffect(value)}
          label="窗口效果"
          options={([
            ...(isMac() ? [['vibrancy', '毛玻璃']] : [['acrylic', '亚克力'], ['mica', '云母']]),
            ['transparent', '透明'],
            ['minimal', '简约'],
            ['none', '不透明'],
          ] as Array<[Settings['windowEffect'], string]>).map(([value, label]) => ({
            value, label,
            disabled: !desktop && value !== 'minimal' && value !== 'none',
            preview: <WindowSketch effect={value} scheme={scheme} />,
          }))}
        />
      </Row>
      {needsRestart && (
        <div className={styles.notice}>
          <span>“透明”需要重新创建窗口，重启应用后生效。</span>
          <Button variant="primary" onClick={() => window.coco?.app?.relaunch()}>立即重启</Button>
        </div>
      )}
      {s.windowEffect !== 'minimal' && <>
      <Row
        title="窗口不透明度"
        description={!desktop ? '需要在桌面客户端中使用' : s.windowEffect === 'none' ? '先选择毛玻璃、亚克力或透明' : s.windowEffect === 'transparent' ? '越低越能清楚看到背后的桌面和其他窗口，文字和按钮始终保持清晰' : '越低越能看到背后被系统模糊的桌面'}
        disabled={!desktop || s.windowEffect === 'none'}
      >
        <Range value={s.windowOpacity} max={100} step={5} onChange={setter('windowOpacity')} label="窗口不透明度" format={value => `${value}%`} />
      </Row>

      <div className={styles.groupLabel}>面板毛玻璃</div>
      <Row title="面板不透明度" description="内容区、播放栏和卡片的透明程度">
        <Range value={s.glassOpacity} max={100} onChange={setter('glassOpacity')} label="面板不透明度" format={value => `${value}%`} />
      </Row>
      <Row title="面板模糊" description="面板背后内容的模糊程度，设为 0 时为清透玻璃">
        <Range value={s.glassBlur} max={60} step={2} onChange={setter('glassBlur')} label="面板模糊" format={value => `${value}px`} />
      </Row>
      </>}

      <div className={styles.groupLabel}>颜色与显示</div>
      <Row title="主题色" description={<>按钮、进度条、高亮等强调色，可点最后一个色块自定义任意颜色 <span className={styles.hexTag}>{s.accent.toUpperCase()}</span></>}>
        <ThemeColorControl value={s.accent} presets={ACCENT_PRESETS} onChange={setter('accent')} />
      </Row>
      <Row title="界面缩放" description="整体放大或缩小界面">
        <Segmented value={s.zoom} onChange={setter('zoom')} label="界面缩放" options={[{ value: 90, label: '90%' }, { value: 100, label: '100%' }, { value: 110, label: '110%' }, { value: 120, label: '120%' }]} />
      </Row>
      <Row title="减弱动态效果" description="关闭页面过渡、旋转唱片等动画；系统开启“减弱动态效果”时会自动生效">
        <Switch checked={s.reduceMotion} onChange={setter('reduceMotion')} label="减弱动态效果" />
      </Row>
    </Section>
  );
}
