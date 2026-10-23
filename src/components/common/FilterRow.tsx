'use client';

import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import styles from './FilterRow.module.css';

export type FilterOption = { id: string; label: string };

/**
 * Labelled single-line option row (ported from the web FilterRow): options
 * that do not fit hide behind 更多, which expands the row with a height
 * animation. The selected option's pill glides between choices.
 */
export function FilterRow({ label, options, value, onChange, allowAll = true }: {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  /** Prepend a 全部 option whose id is ''. */
  allowAll?: boolean;
}) {
  const id = useId();
  const items = allowAll ? [{ id: '', label: '全部' }, ...options] : options;
  const area = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const choices = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [fits, setFits] = useState(items.length);
  const [overflows, setOverflows] = useState(false);
  const [heights, setHeights] = useState({ collapsed: 0, expanded: 0 });

  useLayoutEffect(() => {
    const update = () => {
      const width = area.current?.clientWidth ?? 0;
      const buttons = [...(measure.current?.children ?? [])] as HTMLElement[];
      if (!width || !buttons.length || !measure.current) return;
      const gap = parseFloat(getComputedStyle(measure.current).columnGap) || 0;
      const total = buttons.reduce((sum, button) => sum + button.offsetWidth, 0) + gap * (buttons.length - 1);
      const overflow = total > width;
      const available = width - (overflow ? 64 : 0);
      let used = 0;
      let count = 0;
      for (const button of buttons) {
        const next = button.offsetWidth + (count ? gap : 0);
        if (used + next > available) break;
        used += next;
        count++;
      }
      setFits(Math.max(1, count));
      setOverflows(overflow);
      const collapsed = (choices.current?.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0;
      const full = choices.current?.offsetHeight ?? 0;
      setHeights(previous => (previous.collapsed === collapsed && previous.expanded === full ? previous : { collapsed, expanded: full }));
    };
    update();
    const observer = new ResizeObserver(update);
    if (area.current) observer.observe(area.current);
    if (choices.current) observer.observe(choices.current);
    void document.fonts?.ready.then(update);
    return () => observer.disconnect();
  }, [items.length, options]);

  return (
    <div className={styles.row}>
      <span className={styles.label} id={`${id}-label`}>{label}</span>
      <div ref={area} className={styles.area}>
        <div ref={measure} className={`${styles.choices} ${styles.measure}`} aria-hidden>
          {items.map(option => <span key={option.id} className={styles.option}>{option.label}</span>)}
        </div>
        <div className={styles.viewport} style={{ height: (expanded ? heights.expanded : heights.collapsed) || undefined }}>
          <div ref={choices} className={styles.choices} role="radiogroup" aria-labelledby={`${id}-label`}>
            {items.map((option, index) => {
              const hidden = !expanded && index >= fits;
              const active = value === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={styles.option}
                  data-active={active}
                  data-concealed={hidden || undefined}
                  tabIndex={hidden ? -1 : 0}
                  aria-hidden={hidden || undefined}
                  onClick={() => onChange(option.id)}
                >
                  {active && <motion.span layoutId={`${id}-pill`} className={styles.pill} transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
                  <span className={styles.optionLabel}>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        {overflows && (
          <button type="button" className={styles.more} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
            {expanded ? '收起' : '更多'}
            <motion.span className={styles.chevron} animate={{ rotate: expanded ? 180 : 0 }}>
              <ChevronDown size={13} strokeWidth={1.6} />
            </motion.span>
          </button>
        )}
      </div>
    </div>
  );
}
