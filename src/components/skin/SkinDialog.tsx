'use client';

import { Palette } from 'lucide-react';
import { useState } from 'react';
import { ChoiceTiles } from '@/components/settings/ChoiceTiles';
import { GlassControls } from '@/components/settings/GlassControls';
import { ThemeColorControl } from '@/components/settings/ColorPicker';
import { useResolvedScheme, useThemeColorPicker } from '@/components/settings/ApplyAppearance';
import { Segmented, Switch } from '@/components/settings/controls';
import { chooseWindowEffect, isMac, setter } from '@/components/settings/shared';
import { WindowSketch } from '@/components/settings/WindowSketch';
import { Dialog, IconButton } from '@/components/ui';
import { ACCENT_PRESETS, isFlatStyle, settings, supportsBackdropImage, useSettings, type Settings } from '@/lib/settings';
import { activeSkin, type Skin } from '@/lib/skins';
import { BackdropPicker } from './BackdropPicker';
import { SkinGallery } from './SkinGallery';
import styles from './SkinDialog.module.css';

type Style = 'glass' | 'minimal' | 'fluent';

export function SkinDialog() {
  const s = useSettings();
  const themeColor = useThemeColorPicker();
  const scheme = useResolvedScheme();
  const [open, setOpen] = useState(false);
  const desktop = typeof window !== 'undefined' && Boolean(window.coco);

  // 毛玻璃 is whichever OS material this platform offers; a browser has none, so it stays opaque.
  const glass: Settings['windowEffect'] = !desktop ? 'none' : isMac() ? 'vibrancy' : 'acrylic';
  const flat = isFlatStyle(s.windowEffect);
  const wallpaperAvailable = supportsBackdropImage(s.windowEffect) && (typeof window === 'undefined' || window.coco?.material !== 'transparent');
  const style: Style = isFlatStyle(s.windowEffect) ? s.windowEffect : 'glass';
  const pickStyle = (next: Style) => { void chooseWindowEffect(next === 'glass' ? glass : next); };
  const pickSkin = (skin: Skin) => {
    settings.set('accentFollowsCover', false);
    settings.set('accent', skin.accent);
    settings.set('themeMode', skin.scheme);
  };

  return (
    <>
      <IconButton label="换肤" iconHover={{ rotate: -14, scale: 1.1 }} onClick={() => setOpen(true)} active={open}>
        <Palette size={18} strokeWidth={1.4} />
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} title="换肤" width={560} className={styles.dialog} clearBackdrop>
        <div className={styles.content} data-scroll-native>
          <section>
            <h3>预设主题{!wallpaperAvailable && <small>毛玻璃风格下可用</small>}</h3>
            <SkinGallery active={activeSkin(s.accent, scheme)} disabled={!wallpaperAvailable} onPick={pickSkin} />
          </section>
          {wallpaperAvailable && <section>
            <h3>背景图</h3>
            <BackdropPicker />
          </section>}
          {!flat && <section>
            <h3>窗口与面板</h3>
            <GlassControls />
          </section>}
          <section>
            <h3>界面风格</h3>
            <ChoiceTiles<Style>
              value={style}
              onChange={pickStyle}
              label="界面风格"
              options={([['minimal', '简约'], ['fluent', 'Fluent'], ['glass', '毛玻璃']] as const).map(([value, label]) => ({
                value, label, preview: <WindowSketch effect={value === 'glass' ? glass : value} scheme={scheme} />,
              }))}
            />
          </section>
          <section>
            <h3>外观模式</h3>
            <Segmented value={s.themeMode} onChange={setter('themeMode')} label="外观模式" options={[{ value: 'system', label: '跟随系统' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]} />
          </section>
          <section>
            <h3>主题色</h3>
            <ThemeColorControl {...themeColor} presets={ACCENT_PRESETS} />
            <div className={styles.line}>
              <span>跟随封面取色<small>主题色随正在播放的歌曲变化</small></span>
              <Switch checked={s.accentFollowsCover} onChange={setter('accentFollowsCover')} label="跟随封面取色" />
            </div>
          </section>
        </div>
      </Dialog>
    </>
  );
}
