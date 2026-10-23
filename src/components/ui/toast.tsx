'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import styles from './toast.module.css';

type Tone = 'success' | 'error' | 'info';
type Item = { id: number; tone: Tone; message: string };

let items: Item[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

function push(tone: Tone, message: string, ms = 2600) {
  const id = nextId++;
  // Same message twice in a row: refresh instead of stacking.
  items = [...items.filter(item => item.message !== message), { id, tone, message }].slice(-4);
  emit();
  setTimeout(() => { items = items.filter(item => item.id !== id); emit(); }, ms);
}

/** Fire-and-forget notifications usable from anywhere (stores, handlers). */
export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message, 4000),
  info: (message: string) => push('info', message),
};

const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
const EMPTY: Item[] = [];

export function Toaster() {
  const list = useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => items, () => EMPTY);
  return (
    <div className={styles.stack} role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {list.map(item => {
          const Icon = icons[item.tone];
          return (
            <motion.div
              key={item.id}
              layout
              className={`${styles.toast} ${styles[item.tone]}`}
              initial={{ opacity: 0, y: -14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96, transition: { duration: 0.16 } }}
              transition={{ type: 'spring', stiffness: 480, damping: 34 }}
            >
              <Icon size={16} strokeWidth={1.8} />
              <span>{item.message}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
