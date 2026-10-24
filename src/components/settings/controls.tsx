'use client';

import { motion } from 'framer-motion';
import { Check, ChevronDown, RotateCcw } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Menu, Slider, type MenuItem } from '@/components/ui';
import { cn } from '@/lib/cn';
import styles from './Settings.module.css';

/** iOS-style switch with a springy knob. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cn(styles.switch, checked && styles.switchOn)}
      onClick={() => onChange(!checked)}
    >
      <motion.span className={styles.knob} layout transition={{ type: 'spring', stiffness: 700, damping: 34 }} />
    </button>
  );
}

/** Pill segmented control; the highlight glides between options. */
export function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; hint?: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  const layoutId = useId();
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            className={cn(styles.segment, active && styles.segmentActive)}
            onClick={() => onChange(option.value)}
            data-tooltip={option.hint}
          >
            {active && <motion.span layoutId={layoutId} className={styles.segmentPill} transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span className={styles.segmentLabel}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Dropdown built on the app Menu (consistent look, keyboard/escape handling). */
export function Select<T extends string>({ value, options, onChange, label, placeholder }: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; hint?: string }>;
  onChange: (value: T) => void;
  label: string;
  placeholder?: string;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const current = options.find(option => option.value === value);
  const items: MenuItem[] = options.map(option => ({
    label: option.label,
    hint: option.hint,
    icon: option.value === value ? <Check size={14} strokeWidth={2} /> : <span style={{ width: 14 }} />,
    onSelect: () => onChange(option.value),
  }));
  return (
    <>
      <button ref={anchor} type="button" className={styles.select} onClick={() => setOpen(current => !current)} aria-haspopup="listbox" aria-expanded={open} aria-label={label}>
        <span>{current?.label ?? placeholder ?? '请选择'}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className={styles.selectCaret}><ChevronDown size={14} strokeWidth={1.8} /></motion.span>
      </button>
      <Menu open={open} anchor={anchor} items={items} onClose={() => setOpen(false)} align="end" />
    </>
  );
}

/** Slider with its value readout. */
export function Range({ value, min = 0, max, step = 1, onChange, label, format }: {
  value: number;
  min?: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  format?: (value: number) => string;
}) {
  // The shared Slider is 0-based; shift by `min`.
  const show = format ?? (v => String(v));
  return (
    <div className={styles.range}>
      <Slider
        className={styles.rangeSlider}
        size="sm"
        value={value - min}
        max={max - min}
        step={step}
        label={label}
        onChange={raw => onChange(Math.round((raw + min) / step) * step)}
        formatValue={raw => show(Math.round((raw + min) / step) * step)}
      />
      <output className={styles.rangeValue}>{show(value)}</output>
    </div>
  );
}

/** One labelled setting: title + description on the left, control on the right. */
export function Row({ title, description, children, disabled, vertical }: { title: ReactNode; description?: ReactNode; children: ReactNode; disabled?: boolean; vertical?: boolean }) {
  return (
    <div className={cn(styles.row, disabled && styles.rowDisabled, vertical && styles.rowVertical)}>
      <div className={styles.rowText}>
        <div className={styles.rowTitle}>{title}</div>
        {description && <div className={styles.rowDescription}>{description}</div>}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  );
}

/** A titled group of rows; `onReset` restores just this section's defaults. */
export function Section({ id, icon, title, description, onReset, children }: { id: string; icon: ReactNode; title: string; description?: string; onReset?: () => void; children: ReactNode }) {
  return (
    <section id={`settings-${id}`} data-settings-section={id} className={styles.section} aria-labelledby={`settings-${id}-title`}>
      <header className={styles.sectionHeader}>
        <span className={styles.sectionIcon}>{icon}</span>
        <div>
          <h2 id={`settings-${id}-title`}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {onReset && (
          <button type="button" className={styles.reset} onClick={onReset} data-tooltip="恢复本组默认设置">
            <RotateCcw size={13} strokeWidth={1.8} />恢复默认
          </button>
        )}
      </header>
      <div className={styles.card}>{children}</div>
    </section>
  );
}
