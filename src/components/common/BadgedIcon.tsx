'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import styles from './BadgedIcon.module.css';

/** Compact count in NetEase style: exact below 1000, then 999+, then tiers of w+ (万). */
export function formatBadge(value: number) {
  if (value < 1000) return String(value);
  if (value < 10_000) return '999+';
  for (const tier of [10_000_000, 1_000_000, 100_000, 10_000]) {
    if (value >= tier) return `${tier / 10_000}w+`;
  }
  return '999+';
}

/** Gap kept clear around the digits, in px. */
const GAP = 1.5;

/**
 * Icon with a count tucked into its top-right corner, the way NetEase draws
 * like/comment totals. The digits overlap the glyph, and the glyph's strokes are
 * cut away underneath them with a CSS mask, so the number reads as part of the icon.
 *
 * The mask hole is sized from the rendered digits (font-independent).
 * `reserve` adds the overflow as right margin, for icons followed by text.
 */
export function BadgedIcon({ count, children, reserve = false, className }: { count?: number; children: ReactNode; reserve?: boolean; className?: string }) {
  const wrap = useRef<HTMLSpanElement>(null);
  const glyph = useRef<HTMLSpanElement>(null);
  const digits = useRef<HTMLSpanElement>(null);
  const label = count !== undefined && count > 0 ? formatBadge(count) : '';

  useLayoutEffect(() => {
    const box = wrap.current;
    const icon = glyph.current;
    const text = digits.current;
    if (!box || !icon) return;
    if (!text) {
      icon.style.removeProperty('--cut-w');
      box.style.removeProperty('--reserve');
      return;
    }
    const measure = () => {
      // Offsets share the wrapper as offset parent, so they are in the glyph's coordinates.
      icon.style.setProperty('--cut-x', `${text.offsetLeft - GAP}px`);
      icon.style.setProperty('--cut-y', `${text.offsetTop - GAP}px`);
      icon.style.setProperty('--cut-w', `${text.offsetWidth + GAP * 2}px`);
      icon.style.setProperty('--cut-h', `${text.offsetHeight + GAP * 2}px`);
      box.style.setProperty('--reserve', `${Math.max(0, text.offsetLeft + text.offsetWidth - icon.offsetWidth)}px`);
    };
    measure();
    // Web fonts or zoom can change the digits' width after first paint.
    const observer = new ResizeObserver(measure);
    observer.observe(text);
    return () => observer.disconnect();
  }, [label]);

  return (
    <span ref={wrap} className={cn(styles.wrap, reserve && styles.reserve, className)}>
      <span ref={glyph} className={cn(styles.glyph, label && styles.cut)}>{children}</span>
      {label && <span ref={digits} className={styles.count} aria-hidden>{label}</span>}
    </span>
  );
}
