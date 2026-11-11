'use client';

import { Palette } from 'lucide-react';
import { useRef, useState } from 'react';
import { ChoiceTiles } from '@/components/settings/ChoiceTiles';
import { ThemeColorControl } from '@/components/settings/ColorPicker';
import { useResolvedScheme, useThemeColorPicker } from '@/components/settings/ApplyAppearance';
import { Segmented, Switch } from '@/components/settings/controls';
import { chooseWindowEffect, isMac, setter } from '@/components/settings/shared';
import { WindowSketch } from '@/components/settings/WindowSketch';
import { IconButton, Popover } from '@/components/ui';
import { ACCENT_PRESETS, isFlatStyle, settings, useSettings, type Settings } from '@/lib/settings';
import { activeSkin, type Skin } from '@/lib/skins';
import { BackdropPicker } from './BackdropPicker';
import { SkinGallery } from './SkinGallery';
import styles from './SkinPopover.module.css';

type Style = 'glass' | 'minimal' | 'fluent';

/**
 * 换肤: preset skins, a custom background picture, 外观模式, 界面风格 and 主题色 in one popover.
 * Skins and the picture belong to the 毛玻璃 style; in the flat styles they are shown dimmed.
 */
export function SkinPopover() {
  const s = useSettings();
  const themeColor = useThemeColorPicker();
  const scheme = useResolvedScheme();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const desktop = typeof window !== 'undefined' && Boolean(window.coco);

  // 毛玻璃 is whichever OS material this platform offers; a browser has none, so it stays opaque.
  const glass: Settings['windowEffect'] = !desktop ? 'none' : isMac() ? 'vibrancy' : 'acrylic';
  const flat = isFlatStyle(s.windowEffect);
  const style: Style = isFlatStyle(s.windowEffect) ? s.windowEffect : 'glass';
  const pickStyle = (next: Style) => { void chooseWindowEffect(next === 'glass' ? glass : next); };
  const pickSkin = (skin: Skin) => {
    settings.set('accentFollowsCover', false);
    settings.set('accent', skin.accent);
    settings.set('themeMode', skin.scheme);
  };

  return (
    <>
      <span ref={anchor} className={styles.anchor}>
        <IconButton label="换肤" iconHover={{ rotate: -14, scale: 1.1 }} onClick={() => setOpen(value => !value)} active={open} pressed={open}>
          <Palette size={18} strokeWidth={1.4} />
        </IconButton>
      </span>
      <Popover open={open} anchor={anchor} onClose={() => setOpen(false)} label="换肤" width={372}>
        <div className={styles.content}>
          <section>
            <h3>皮肤{flat && <small>切换到毛玻璃风格后可用</small>}</h3>
            <SkinGallery active={activeSkin(s.accent, scheme)} disabled={flat} onPick={pickSkin} />
          </section>
          <section>
            <h3>背景图{flat && <small>切换到毛玻璃风格后可用</small>}</h3>
            <BackdropPicker disabled={flat} />
          </section>
          <section>
            <h3>界面风格</h3>
            <ChoiceTiles<Style>
              value={style}
              onChange={pickStyle}
              label="界面风格"
              options={([['glass', '毛玻璃'], ['minimal', '简约'], ['fluent', 'Fluent']] as const).map(([value, label]) => ({
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
      </Popover>
    </>
  );
}
