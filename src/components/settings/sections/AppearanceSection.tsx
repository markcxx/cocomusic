'use client';

import { AppWindow, Palette, SunMoon, Wind, ZoomIn } from 'lucide-react';
import { ACCENT_PRESETS, isFlatStyle, settings, useSettings, type Settings } from '@/lib/settings';
import { ThemeColorControl } from '../ColorPicker';
import { useFluentStyle, useResolvedScheme, useThemeColorPicker } from '../ApplyAppearance';
import { ChoiceTiles } from '../ChoiceTiles';
import { GlassControls } from '../GlassControls';
import { WindowSketch } from '../WindowSketch';
import { ChoiceExpander, Row, Section, Select, Switch } from '../controls';
import { chooseWindowEffect, isDesktop, isMac, keysOf, setter } from '../shared';
import styles from '../Settings.module.css';

const WINDOW_EFFECT_HINTS: Record<string, string> = {
  vibrancy: '系统毛玻璃：背后的桌面被实时模糊后透出来，模糊强度由系统决定',
  acrylic: '系统亚克力：背后的桌面被强模糊并带细微噪点，模糊强度由系统决定',
  mica: '云母：取桌面壁纸的柔和色调（Windows 11），不透出其他窗口',
  transparent: '和桌面歌词一样的真透明窗口：背后的桌面和窗口清晰可见，不做模糊',
  minimal: '简约：浅灰导航栏与播放栏，白色内容卡片，不透明、无毛玻璃',
  fluent: 'Fluent：Windows 11 风格的分层与小圆角，播放栏跟随封面主色，不透明、无毛玻璃',
  none: '不透明窗口',
};

const MODES = [
  { value: 'system', label: '跟随系统', scheme: 'split' },
  { value: 'light', label: '浅色', scheme: 'light' },
  { value: 'dark', label: '深色', scheme: 'dark' },
] as const;

/** 设置 › 外观 */
export function AppearanceSection() {
  const s = useSettings();
  const themeColor = useThemeColorPicker();
  const desktop = isDesktop();
  const shownEffect = s.windowEffect === 'none' || s.windowEffect === 'transparent' || isFlatStyle(s.windowEffect) ? s.windowEffect
    : isMac() ? 'vibrancy' : s.windowEffect === 'vibrancy' ? 'acrylic' : s.windowEffect;
  const fluent = useFluentStyle();
  const scheme = useResolvedScheme();
  return (
    <Section id="appearance" icon={<Palette size={17} strokeWidth={1.6} />} title="外观" description="深浅色、窗口效果、毛玻璃与主题色" onReset={() => settings.reset(keysOf('themeMode', 'windowEffect', 'windowOpacity', 'glassOpacity', 'glassBlur', 'accent', 'reduceMotion', 'zoom'))}>
      <Row icon={<SunMoon size={16} strokeWidth={1.5} />} title="外观模式" description="跟随系统时，系统切换深浅色会自动同步" vertical={!fluent}>
        {fluent ? (
          <Select value={s.themeMode} onChange={setter('themeMode')} label="外观模式" options={MODES} />
        ) : (
          <ChoiceTiles
            value={s.themeMode}
            onChange={setter('themeMode')}
            label="外观模式"
            options={MODES.map(({ value, label, scheme }) => ({
              value, label, preview: <WindowSketch effect={shownEffect} scheme={scheme} />,
            }))}
          />
        )}
      </Row>

      {!fluent && <div className={styles.groupLabel}>窗口</div>}
      <Row
        icon={<AppWindow size={16} strokeWidth={1.5} />}
        title="窗口效果"
        description={WINDOW_EFFECT_HINTS[shownEffect] ?? WINDOW_EFFECT_HINTS.none}
        vertical
      >
        {/* Materials need the desktop client; 简约, Fluent and 不透明 are drawn by the page itself. */}
        <ChoiceTiles
          value={shownEffect}
          onChange={chooseWindowEffect}
          label="窗口效果"
          options={([
            ['minimal', '简约'],
            ['fluent', 'Fluent'],
            ...(isMac() ? [['vibrancy', '毛玻璃']] : [['acrylic', '亚克力'], ['mica', '云母']]),
            ['transparent', '透明'],
            ['none', '不透明'],
          ] as Array<[Settings['windowEffect'], string]>).map(([value, label]) => ({
            value, label,
            disabled: !desktop && !isFlatStyle(value) && value !== 'none',
            preview: <WindowSketch effect={value} scheme={scheme} />,
          }))}
        />
      </Row>
      <GlassControls />

      {!fluent && <div className={styles.groupLabel}>颜色与显示</div>}
      <Row icon={<Palette size={16} strokeWidth={1.5} />} title="主题色" description={<>按钮、进度条、高亮等强调色，可点最后一个色块自定义任意颜色 <span className={styles.hexTag}>{themeColor.value.toUpperCase()}</span></>}>
        <ThemeColorControl {...themeColor} presets={ACCENT_PRESETS} />
      </Row>
      <ChoiceExpander icon={<ZoomIn size={16} strokeWidth={1.5} />} title="界面缩放" description="整体放大或缩小界面" value={s.zoom} onChange={setter('zoom')} label="界面缩放" options={[{ value: 90, label: '90%' }, { value: 100, label: '100%' }, { value: 110, label: '110%' }, { value: 120, label: '120%' }]} />
      <Row icon={<Wind size={16} strokeWidth={1.5} />} title="减弱动态效果" description="关闭页面过渡、旋转唱片等动画；系统开启“减弱动态效果”时会自动生效">
        <Switch checked={s.reduceMotion} onChange={setter('reduceMotion')} label="减弱动态效果" />
      </Row>
    </Section>
  );
}
