'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import styles from './ChoiceTiles.module.css';

export type ChoiceTile<T> = { value: T; label: string; preview: ReactNode; disabled?: boolean };

/**
 * A radio group drawn as preview tiles (a picture above each label), for
 * settings where seeing the result says more than a word: 外观模式, 窗口效果…
 */
export function ChoiceTiles<T extends string | number>({ value, options, onChange, label }: {
  value: T;
  options: readonly ChoiceTile<T>[];
  onChange: (value: T) => void;
  label: string;
}) {
  const layoutId = useId();
  return (
    <div className={styles.grid} role="radiogroup" aria-label={label}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            className={cn(styles.tile, selected && styles.tileOn)}
            onClick={() => onChange(option.value)}
          >
            <span className={styles.preview} aria-hidden>
              {option.preview}
              {selected && (
                <motion.span layoutId={layoutId} className={styles.check} transition={{ type: 'spring', stiffness: 520, damping: 36 }}>
                  <Check size={11} strokeWidth={2.6} />
                </motion.span>
              )}
            </span>
            <span className={styles.label}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
