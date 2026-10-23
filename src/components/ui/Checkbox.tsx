'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, Minus } from 'lucide-react';
import type { MouseEvent } from 'react';
import { cn } from '@/lib/cn';
import styles from './Checkbox.module.css';

/** Round checkbox with a springy tick; `mixed` shows a dash (partial selection). */
export function Checkbox({ checked, mixed = false, onChange, label, className }: {
  checked: boolean;
  mixed?: boolean;
  /** Receives the click so callers can read shiftKey for range selection. */
  onChange: (event: MouseEvent<HTMLButtonElement>) => void;
  label: string;
  className?: string;
}) {
  const on = checked || mixed;
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={mixed ? 'mixed' : checked}
      aria-label={label}
      className={cn(styles.box, on && styles.on, className)}
      onClick={event => { event.stopPropagation(); onChange(event); }}
      whileTap={{ scale: 0.85 }}
    >
      <AnimatePresence initial={false}>
        {on && (
          <motion.span key={mixed ? 'mixed' : 'check'} className={styles.mark} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.3, opacity: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 22 }}>
            {mixed ? <Minus size={12} strokeWidth={2.6} /> : <Check size={12} strokeWidth={2.6} />}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
