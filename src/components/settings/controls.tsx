'use client';

import { motion } from 'framer-motion';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Menu, Slider, type MenuItem } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useFluentStyle } from './ApplyAppearance';
import styles from './Settings.module.css';

/** iOS-style switch with a springy knob. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <span className={styles.switchWrap}>
      {/* Fluent shows the state next to the switch (WinUI ToggleSwitch "On" / "Off"); hidden in the other styles. */}
      <span className={styles.switchState} aria-hidden>{checked ? '开' : '关'}</span>
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
    </span>
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
    selected: option.value === value,
    onSelect: () => onChange(option.value),
  }));
  return (
    <>
      <button ref={anchor} type="button" className={styles.select} onClick={() => setOpen(current => !current)} aria-haspopup="menu" aria-expanded={open} aria-label={label}>
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

/**
 * One labelled setting: title + description on the left, control on the right.
 * `icon` is the 16px glyph Fluent shows in front of the title (hidden in the other styles).
 */
export function Row({ icon, title, description, children, disabled, vertical }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; children: ReactNode; disabled?: boolean; vertical?: boolean }) {
  const fluent = useFluentStyle();
  return (
    <div className={cn(styles.row, disabled && styles.rowDisabled, vertical && styles.rowVertical)} data-described={description ? '' : undefined}>
      {icon && <span className={styles.rowIcon} aria-hidden>{icon}</span>}
      <div className={styles.rowText}>
        <div className={styles.rowTitle}>{title}</div>
        {description && <div className={styles.rowDescription}>{description}</div>}
      </div>
      <div className={styles.rowControl} inert={fluent && disabled}>{children}</div>
    </div>
  );
}

/**
 * A one-of-many setting. Fluent draws it as a WinUI SettingsExpander: the header shows
 * the current choice, and opening it lists every option as a radio. The other styles
 * keep the compact control in the row (`variant`: segmented buttons or a dropdown).
 */
export function ChoiceExpander<T extends string | number>({ icon, title, description, disabled, variant = 'segmented', value, options, onChange, label }: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  variant?: 'segmented' | 'select';
  value: T;
  options: ReadonlyArray<{ value: T; label: string; hint?: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const fluent = useFluentStyle();
  if (!fluent) {
    return (
      <Row icon={icon} title={title} description={description} disabled={disabled}>
        {variant === 'select'
          ? <Select value={String(value)} options={options.map(option => ({ ...option, value: String(option.value) }))} onChange={next => onChange(options.find(option => String(option.value) === next)!.value)} label={label} />
          : <Segmented value={value} options={options} onChange={onChange} label={label} />}
      </Row>
    );
  }
  const current = options.find(option => option.value === value);
  return (
    <div className={cn(styles.expander, disabled && styles.rowDisabled)} data-open={open || undefined}>
      <button type="button" className={styles.expanderHeader} onClick={() => setOpen(next => !next)} aria-expanded={open} aria-controls={bodyId} disabled={disabled}>
        {icon && <span className={styles.rowIcon} aria-hidden>{icon}</span>}
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{title}</span>
          {description && <span className={styles.rowDescription}>{description}</span>}
        </span>
        <span className={styles.expanderValue}>{current?.label}</span>
        <span className={styles.expanderChevron} aria-hidden><ChevronDown size={14} strokeWidth={1.8} /></span>
      </button>
      <div id={bodyId} className={styles.expanderBody} inert={!open || disabled}>
        <div className={styles.expanderItems} role="radiogroup" aria-label={label}>
          {options.map(option => (
            <button key={String(option.value)} type="button" role="radio" aria-checked={option.value === value} className={styles.radio} onClick={() => onChange(option.value)}>
              <span className={styles.radioDot} aria-hidden />
              <span className={styles.radioText}>{option.label}{option.hint && <small>{option.hint}</small>}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Related controls whose values refine the preceding setting. */
export function DependentSettings({ label, children }: { label: string; children: ReactNode }) {
  const fluent = useFluentStyle();
  return fluent ? <div role="group" aria-label={label} className={styles.dependent}>{children}</div> : <>{children}</>;
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
