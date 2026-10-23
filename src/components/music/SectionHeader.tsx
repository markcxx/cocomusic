'use client';

import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './SectionHeader.module.css';

export function SectionHeader({ title, actionLabel, onAction, children }: { title: string; actionLabel?: string; onAction?: () => void; children?: ReactNode }) {
  return (
    <div className={styles.header}>
      <h2>{title}</h2>
      <div className={styles.side}>
        {children}
        {actionLabel && (
          <motion.button type="button" className={styles.action} onClick={onAction} whileHover="hover" initial="rest">
            {actionLabel}
            <motion.span variants={{ rest: { x: 0 }, hover: { x: 3 } }} className={styles.chevron}>
              <ChevronRight size={14} strokeWidth={1.5} aria-hidden />
            </motion.span>
          </motion.button>
        )}
      </div>
    </div>
  );
}
