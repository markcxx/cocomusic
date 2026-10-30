'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AudioLines, Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Cover } from '@/components/common/Cover';
import { cn } from '@/lib/cn';
import { isRingTemplate, needsSamples, settings, stripTemplate, useSettings, type LyricsLayout, type VinylEffect, type VisualizerColor, type VisualizerTemplate } from '@/lib/settings';
import { usePlayer } from '../player-store';
import { useCoverTint } from './cover-tint';
import { TemplatePreview } from './Visualizer';
import styles from './VisualizerPicker.module.css';

/** One flat set of looks (no categories), shown as an even grid. */
export const TEMPLATES: Array<{ value: VisualizerTemplate; label: string }> = [
  { value: 'lines', label: '细线频谱' },
  { value: 'glow', label: '柔光波' },
  { value: 'mirror', label: '镜面倒影' },
  { value: 'vinyl', label: '经典唱片' },
  { value: 'melody', label: '跳动旋律' },
  { value: 'ripple', label: '迷幻水波' },
  { value: 'scale', label: '动感音阶' },
  { value: 'roaming', label: '星河漫游' },
];

const LAYOUTS: Array<{ value: LyricsLayout; label: string }> = [
  { value: 'standard', label: '标准' },
  { value: 'centered', label: '居中' },
  { value: 'lyrics', label: '歌词' },
];

/** Line drawing of each layout: a disc and lyric strokes, as in the reference card. */
function LayoutGlyph({ layout }: { layout: LyricsLayout }) {
  return (
    <svg viewBox="0 0 64 34" aria-hidden>
      {layout === 'standard' && (
        <>
          <circle cx="19" cy="17" r="9" />
          <path d="M34 12h18M34 17h18M34 22h14" />
        </>
      )}
      {layout === 'centered' && (
        <>
          <circle cx="32" cy="13" r="8" />
          <path d="M23 27h18" />
        </>
      )}
      {layout === 'lyrics' && <path d="M22 8h20M18 13h28M16 18h32M18 23h28M24 28h16" />}
    </svg>
  );
}

/**
 * Change the look (or 经典唱片's paired strip). When the new pick starts
 * reading audio, the stream is reloaded once in CORS mode.
 */
export function pickTemplate(current: VisualizerTemplate, next: VisualizerTemplate, reloadStream: () => void, vinylEffect?: VinylEffect) {
  const before = needsSamples(current, settings.get().lyricsVinylEffect);
  settings.set('lyricsVisualizer', next);
  if (vinylEffect) settings.set('lyricsVinylEffect', vinylEffect);
  if (!before && needsSamples(next, settings.get().lyricsVinylEffect)) reloadStream();
}

const VINYL_EFFECTS: Array<{ value: VinylEffect; label: string }> = [
  { value: 'none', label: '无' },
  { value: 'lines', label: '细线频谱' },
  { value: 'glow', label: '柔光波' },
];

/** Tiny lyrics page in the card: artwork (or record) + three lyric lines + a fixed template frame. */
function Thumb({ template, color, tint, seed, src, strip }: { template: VisualizerTemplate; color: VisualizerColor; tint: string; seed: string; src?: string; strip: 'lines' | 'glow' | null }) {
  const ring = isRingTemplate(template);
  if (template === 'roaming') return <span className={cn(styles.thumb, styles.thumbRoaming)} style={{ '--tint': tint } as React.CSSProperties} aria-hidden>
    <Cover seed={seed} src={src} className={styles.roamingCover} radius={0} />
    <span className={styles.roamingShade} />
    <span className={styles.roamingLyrics}>
      <span className={styles.roamingDistant}>沿着旋律</span>
      <span className={styles.roamingUpcoming}>走向下一句</span>
      <span className={styles.roamingCurrent}>让音乐靠近</span>
    </span>
    <span className={styles.roamingNotes}>
      <i>♪</i><i>♫</i><i>♩</i><i>♪</i><i>♫</i><i>♬</i>
    </span>
  </span>;
  return (
    <span className={styles.thumb} style={{ '--tint': tint } as React.CSSProperties}>
      <span className={cn(styles.thumbArt, template === 'mirror' && styles.thumbArtHigh)}>
        {template === 'vinyl' ? (
          // 经典唱片: black disc with the artwork label and a small tonearm.
          <>
            <span className={styles.thumbDisc}><Cover seed={seed} src={src} radius={999} className={styles.thumbLabel} /></span>
            <span className={styles.thumbArm} />
          </>
        ) : ring ? (
          // Effects around a round cover (no record).
          <>
            <TemplatePreview template={template} color={color} tint={tint} className={styles.thumbRing} />
            <Cover seed={seed} src={src} radius={999} className={styles.thumbRound} />
          </>
        ) : (
          <Cover seed={seed} src={src} radius={5} className={styles.thumbCover} />
        )}
        {template === 'mirror' && <TemplatePreview template="mirror" color={color} tint={tint} className={styles.thumbMirror} />}
      </span>
      <span className={styles.thumbLines} aria-hidden><i /><b /><i /></span>
      {strip && <TemplatePreview key={strip} template={strip} color={color} tint={tint} className={cn(styles.thumbStrip, strip === 'glow' && styles.thumbStripGlow)} />}
      {strip && <span className={styles.thumbProgress} />}
      {template === 'off' && <span className={styles.thumbOff}>关闭</span>}
    </span>
  );
}

/**
 * 歌词页右上角的「播放器模式」按钮与卡片。每个模式都是一张静态的小歌词页预览；
 * 选择立即生效并保存到 设置 › 歌词页（配色、密度也在那里）。
 */
export function VisualizerPicker() {
  const prefs = useSettings();
  const { track, reloadStream } = usePlayer();
  const tint = useCoverTint(track.cover, track.coverSeed);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const active = prefs.lyricsVisualizer !== 'off';

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const node = event.target as Node;
      if (card.current?.contains(node) || button.current?.contains(node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Close the card only; the lyrics page's own Escape must not fire too.
      event.stopImmediatePropagation();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => card.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
    return () => { document.removeEventListener('pointerdown', onPointer); window.removeEventListener('keydown', onKey, true); };
  }, [open]);

  const tile = (value: VisualizerTemplate, label: string, index: number) => {
    const selected = prefs.lyricsVisualizer === value;
    return (
      <motion.button
        key={value}
        type="button"
        role="radio"
        aria-checked={selected}
        className={cn(styles.tile, selected && styles.tileOn)}
        onClick={() => pickTemplate(prefs.lyricsVisualizer, value, reloadStream)}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.025 * index }}
      >
        <Thumb template={value} color={prefs.lyricsVisualizerColor} tint={tint} seed={track.coverSeed} src={track.cover} strip={stripTemplate(value, prefs.lyricsVinylEffect)} />
        <span className={styles.tileLabel}>{label}</span>
        {selected && (
          <motion.span layoutId="visualizer-check" className={styles.check} transition={{ type: 'spring', stiffness: 520, damping: 36 }}>
            <Check size={10} strokeWidth={3.2} />
          </motion.span>
        )}
      </motion.button>
    );
  };

  return (
    <div className={styles.anchor}>
      <motion.button
        ref={button}
        type="button"
        className={cn(styles.trigger, (open || active) && styles.triggerOn)}
        onClick={() => setOpen(value => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="播放模式"
        whileTap={{ scale: 0.92 }}
      >
        <AudioLines size={15} strokeWidth={1.6} />
        播放模式
        <motion.span className={styles.caret} animate={{ rotate: open ? 180 : 0 }}><ChevronDown size={13} strokeWidth={1.8} /></motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={card}
            className={styles.card}
            role="dialog"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.14 } }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
          >
            <div className={styles.layouts} role="radiogroup" aria-label="布局">
              {LAYOUTS.map(item => {
                const on = prefs.lyricsLayout === item.value;
                return (
                  <button key={item.value} type="button" role="radio" aria-checked={on} className={cn(styles.layout, on && styles.layoutOn)} onClick={() => settings.set('lyricsLayout', item.value)}>
                    <span className={styles.layoutIcon}><LayoutGlyph layout={item.value} /></span>
                    <span className={styles.layoutLabel}>
                      <span className={styles.radio}>{on && <motion.span layoutId="layout-dot" className={styles.radioDot} transition={{ type: 'spring', stiffness: 520, damping: 36 }} />}</span>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <header className={styles.header}>
              <h3 id={titleId}>播放器模式</h3>
              <button type="button" role="radio" aria-checked={!active} className={cn(styles.offChip, !active && styles.offChipOn)} onClick={() => pickTemplate(prefs.lyricsVisualizer, 'off', reloadStream)}>
                {active ? '关闭' : '已关闭'}
              </button>
            </header>

            <div className={styles.grid} role="radiogroup" aria-label="模板">
              {TEMPLATES.map((item, index) => tile(item.value, item.label, index))}
            </div>

            <AnimatePresence initial={false}>
              {prefs.lyricsVisualizer === 'vinyl' && (
                <motion.div
                  key="pair"
                  className={styles.pair}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className={styles.pairInner}>
                    <span className={styles.pairLabel}>经典唱片搭配</span>
                    <div className={styles.pairOptions} role="radiogroup" aria-label="经典唱片搭配效果">
                      {VINYL_EFFECTS.map(item => {
                        const on = prefs.lyricsVinylEffect === item.value;
                        return (
                          <button key={item.value} type="button" role="radio" aria-checked={on} className={cn(styles.pairOption, on && styles.pairOptionOn)} onClick={() => pickTemplate(prefs.lyricsVisualizer, 'vinyl', reloadStream, item.value)}>
                            {on && <motion.span layoutId="vinyl-pair" className={styles.pairPill} transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {prefs.reduceMotion && <p className={styles.note}>已开启「减少动效」，播放器模式暂不显示动画；配色可在 设置 › 歌词页 中修改</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
