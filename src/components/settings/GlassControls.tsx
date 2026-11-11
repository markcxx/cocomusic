'use client';

import { isFlatStyle, useSettings } from '@/lib/settings';
import { supportedEffect } from './ApplyAppearance';
import { Range, Row } from './controls';
import { setter } from './shared';
import styles from './Settings.module.css';

const opacityHints = {
  vibrancy: '降低后，背景图和面板逐渐淡出，露出系统模糊后的桌面',
  acrylic: '降低后，背景图和面板逐渐淡出，露出系统模糊后的桌面',
  mica: '降低后露出由桌面壁纸取色的云母材质',
  transparent: '降低后露出窗口后的桌面和其他窗口',
  none: '需要启用系统毛玻璃或透明窗口',
};

export function GlassControls() {
  const s = useSettings();
  const effect = supportedEffect(s.windowEffect);
  if (isFlatStyle(effect)) return null;
  return (
    <>
      <Row title="窗口不透明度" description={opacityHints[effect]} disabled={effect === 'none'}>
        <div inert={effect === 'none'}>
          <Range value={s.windowOpacity} max={100} step={5} onChange={setter('windowOpacity')} label="窗口不透明度" format={value => `${value}%`} />
        </div>
      </Row>
      <div className={styles.groupLabel}>面板毛玻璃</div>
      <Row title="面板不透明度" description="内容区、播放栏和卡片的底色浓度">
        <Range value={s.glassOpacity} max={100} onChange={setter('glassOpacity')} label="面板不透明度" format={value => `${value}%`} />
      </Row>
      <Row title="面板模糊" description="模糊面板下方的应用背景，设为 0 可看清背景图">
        <Range value={s.glassBlur} max={60} step={2} onChange={setter('glassBlur')} label="面板模糊" format={value => `${value}px`} />
      </Row>
    </>
  );
}
