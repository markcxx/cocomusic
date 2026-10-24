'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, Pipette } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { hsvToRgb, parseHex, rgbToHsv, toHex, type Hsv } from '@/lib/color';
import { cn } from '@/lib/cn';
import styles from './ColorPicker.module.css';

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };
const eyeDropper = () => (typeof window !== 'undefined' ? (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper : undefined);

/** Drag helper: pointer capture + 0–1 coordinates inside the element. */
function useDrag(onMove: (x: number, y: number) => void, onEnd?: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    onMove(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)));
  };
  return {
    ref,
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => { event.currentTarget.setPointerCapture(event.pointerId); move(event); },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event); },
    onPointerUp: () => onEnd?.(),
  };
}

/** Saturation/value field + hue strip + hex field + eyedropper. */
function Picker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  // Keep HSV locally: converting through hex loses hue at grey/black.
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(parseHex(value) ?? { r: 155, g: 135, b: 191 }));
  const [text, setText] = useState(value);
  // The value we last emitted (or adopted). A different incoming value is an
  // external change (preset click, reset): re-seed during render, no effect needed.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    const rgb = parseHex(value);
    if (rgb) { setHsv(rgbToHsv(rgb)); setText(value); }
  }

  const commit = (next: Hsv) => {
    setHsv(next);
    const hex = toHex(hsvToRgb(next));
    setSeen(hex);
    setText(hex);
    onChange(hex);
  };

  const field = useDrag((x, y) => commit({ ...hsv, s: x, v: 1 - y }));
  const hue = useDrag(x => commit({ ...hsv, h: Math.min(359.9, x * 360) }));
  const pure = toHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));
  const current = toHex(hsvToRgb(hsv));

  const fieldKeys = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, Partial<Hsv>> = { ArrowLeft: { s: hsv.s - step }, ArrowRight: { s: hsv.s + step }, ArrowUp: { v: hsv.v + step }, ArrowDown: { v: hsv.v - step } };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    commit({ ...hsv, s: Math.min(1, Math.max(0, move.s ?? hsv.s)), v: Math.min(1, Math.max(0, move.v ?? hsv.v)) });
  };
  const hueKeys = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 15 : 3;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    commit({ ...hsv, h: (hsv.h + (event.key === 'ArrowRight' ? step : -step) + 360) % 360 });
  };

  const sample = async () => {
    const Ctor = eyeDropper();
    if (!Ctor) return;
    try {
      const { sRGBHex } = await new Ctor().open();
      const rgb = parseHex(sRGBHex);
      if (rgb) commit(rgbToHsv(rgb));
    } catch { /* cancelled */ }
  };

  return (
    <div className={styles.picker}>
      <div
        {...field}
        className={styles.field}
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})` }}
        role="slider"
        tabIndex={0}
        aria-label="饱和度与亮度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={current}
        onKeyDown={fieldKeys}
      >
        <span className={styles.fieldThumb} style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: current }} />
      </div>
      <div {...hue} className={styles.hue} role="slider" tabIndex={0} aria-label="色相" aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv.h)} onKeyDown={hueKeys}>
        <span className={styles.hueThumb} style={{ left: `${(hsv.h / 360) * 100}%`, background: pure }} />
      </div>
      <div className={styles.inputs}>
        <span className={styles.preview} style={{ background: current }} />
        <label className={styles.hex}>
          <span>HEX</span>
          <input
            value={text}
            maxLength={7}
            spellCheck={false}
            onChange={event => {
              const next = event.target.value.startsWith('#') ? event.target.value : `#${event.target.value}`;
              setText(next);
              const rgb = /^#[0-9a-f]{6}$/i.test(next) ? parseHex(next) : null;
              if (rgb) commit(rgbToHsv(rgb));
            }}
            onBlur={() => setText(current)}
            aria-label="十六进制颜色"
          />
        </label>
        {eyeDropper() && (
          <button type="button" className={styles.dropper} onClick={() => void sample()} aria-label="从屏幕取色" data-tooltip="从屏幕取色">
            <Pipette size={15} strokeWidth={1.7} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Theme colour control: crisp preset swatches plus a "custom" swatch that
 * opens a full colour picker (any colour). The picked colour applies live.
 */
export function ThemeColorControl({ value, presets, onChange, label = '主题色' }: { value: string; presets: Array<{ label: string; color: string }>; onChange: (hex: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const isPreset = presets.some(preset => preset.color.toLowerCase() === value.toLowerCase());

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const rect = anchor.current.getBoundingClientRect();
    const width = 264;
    const height = 330;
    const below = rect.bottom + 8 + height < window.innerHeight - 12;
    setPosition({ top: below ? rect.bottom + 8 : rect.top - 8 - height, left: Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width)) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const node = event.target as Node;
      if (panel.current?.contains(node) || anchor.current?.contains(node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); window.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className={styles.control}>
      <div className={styles.swatches} role="radiogroup" aria-label={label}>
        {presets.map(preset => {
          const active = preset.color.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={preset.color}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={preset.label}
              data-tooltip={preset.label}
              className={cn(styles.swatch, active && styles.swatchActive)}
              style={{ background: preset.color }}
              onClick={() => onChange(preset.color)}
            >
              {active && <Check size={14} strokeWidth={3} />}
            </button>
          );
        })}
        <button
          ref={anchor}
          type="button"
          aria-pressed={!isPreset}
          aria-label="自定义颜色"
          aria-haspopup="dialog"
          aria-expanded={open}
          data-tooltip="自定义颜色"
          className={cn(styles.swatch, styles.custom, !isPreset && styles.swatchActive)}
          style={!isPreset ? { background: value } : undefined}
          onClick={() => setOpen(current => !current)}
        >
          {!isPreset ? <Check size={14} strokeWidth={3} /> : null}
        </button>
      </div>
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panel}
              className={styles.popover}
              role="dialog"
              aria-label={`自定义${label}`}
              style={{ top: position?.top ?? -9999, left: position?.left ?? -9999 }}
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            >
              <Picker value={value} onChange={onChange} />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
