'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import styles from './SearchField.module.css';

/** Compact in-page filter input (e.g. filter tracks in a playlist). Grows on focus. */
export function SearchField({ value, onChange, placeholder, label, className }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <label className={cn(styles.field, className)}>
      <Search size={14} strokeWidth={1.5} aria-hidden />
      <input type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={label} spellCheck={false} />
      <AnimatePresence>
        {value && (
          <motion.button type="button" className={styles.clear} onClick={() => onChange('')} aria-label="清空" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
            <X size={11} strokeWidth={1.8} />
          </motion.button>
        )}
      </AnimatePresence>
    </label>
  );
}
