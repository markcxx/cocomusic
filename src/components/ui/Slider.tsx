'use client';

import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/cn';
import styles from './Slider.module.css';

/**
 * Pointer-driven slider with a hover preview tooltip.
 * - Hover: track thickens, a ghost bar previews where a click would land.
 * - Drag: thumb grows, fill follows the pointer instantly; onCommit fires on release.
 * - Keyboard: arrows/Page/Home/End, same as a native range input.
 */
export function Slider({ value, max, onChange, onCommit, label, formatValue, step, className, size = 'md' }: {
  value: number;
  max: number;
  /** Fires continuously while dragging. */
  onChange?: (value: number) => void;
  /** Fires once when a drag or click finishes (use for seeking audio). */
  onCommit?: (value: number) => void;
  label: string;
  formatValue?: (value: number) => string;
  step?: number;
  className?: string;
  size?: 'md' | 'sm';
}) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const shown = dragValue ?? value;
  const ratio = max > 0 ? Math.min(1, Math.max(0, shown / max)) : 0;

  // Fill eases toward external value changes; jumps instantly while dragging.
  const fill = useMotionValue(ratio);
  const smooth = useSpring(fill, { stiffness: 380, damping: 40, mass: 0.6 });
  useEffect(() => { fill.set(ratio); if (dragging) smooth.jump(ratio); }, [ratio, dragging, fill, smooth]);
  const width = useTransform(smooth, v => `${v * 100}%`);

  const valueAt = useCallback((clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const raw = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * max;
    return step ? Math.round(raw / step) * step : raw;
  }, [max, step]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = valueAt(event.clientX);
    setDragging(true);
    setDragValue(next);
    onChange?.(next);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const next = valueAt(event.clientX);
    setHover(next);
    if (!dragging) return;
    setDragValue(next);
    onChange?.(next);
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const next = valueAt(event.clientX);
    setDragging(false);
    setDragValue(null);
    onChange?.(next);
    onCommit?.(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const unit = step ?? max / 100;
    const deltas: Record<string, number> = { ArrowRight: unit, ArrowUp: unit, ArrowLeft: -unit, ArrowDown: -unit, PageUp: unit * 10, PageDown: -unit * 10 };
    let next: number | undefined;
    if (event.key in deltas) next = Math.min(max, Math.max(0, value + deltas[event.key]));
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = max;
    if (next === undefined) return;
    event.preventDefault();
    onChange?.(next);
    onCommit?.(next);
  };

  const hoverRatio = hover !== null && max > 0 ? hover / max : null;
  const format = formatValue ?? (v => String(Math.round(v)));

  return (
    <div
      ref={track}
      className={cn(styles.slider, size === 'sm' && styles.small, dragging && styles.dragging, className)}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={format(shown)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onPointerLeave={() => { if (!dragging) setHover(null); }}
      onKeyDown={onKeyDown}
      style={{ '--ratio': ratio } as CSSProperties}
    >
      <div className={styles.rail}>
        {hoverRatio !== null && !dragging && <div className={styles.ghost} style={{ width: `${hoverRatio * 100}%` }} />}
        <motion.div className={styles.fill} style={{ width }} />
      </div>
      <motion.div className={styles.thumb} style={{ left: width }} />
      <AnimatePresence>
        {(hoverRatio !== null || dragging) && (
          <motion.div
            className={styles.tooltip}
            style={{ left: `${(dragging ? ratio : hoverRatio ?? 0) * 100}%` }}
            initial={{ opacity: 0, y: 4, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.9 }}
            transition={{ duration: 0.14 }}
          >
            {format(dragging ? shown : hover ?? 0)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
