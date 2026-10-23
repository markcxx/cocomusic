'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { RotateCw, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './AsyncState.module.css';

/** Error panel with a retry action, shared by every data-backed section. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <motion.div className={styles.error} role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <WifiOff size={20} strokeWidth={1.4} aria-hidden />
      <span>{message}</span>
      <motion.button type="button" onClick={onRetry} whileTap={{ scale: 0.94 }} initial="rest" whileHover="hover">
        <motion.span variants={{ rest: { rotate: 0 }, hover: { rotate: 180 } }} transition={{ type: 'spring', stiffness: 200, damping: 14 }} className={styles.icon}>
          <RotateCw size={14} strokeWidth={1.6} />
        </motion.span>
        重试
      </motion.button>
    </motion.div>
  );
}

/** Cross-fades skeleton → content so data arrival never pops. */
export function Swap({ loading, skeleton, children }: { loading: boolean; skeleton: ReactNode; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={loading ? 'skeleton' : 'content'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
        {loading ? skeleton : children}
      </motion.div>
    </AnimatePresence>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <span className={`${styles.skeleton} ${className ?? ''}`} aria-hidden />;
}
