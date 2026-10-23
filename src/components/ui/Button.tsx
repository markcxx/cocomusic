'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import styles from './Button.module.css';

/** Pill button with a leading icon: primary (lavender fill) or soft (glass). */
export function Button({ children, icon, onClick, variant = 'soft', disabled, className, title }: {
  children: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'soft' | 'ghost';
  disabled?: boolean;
  className?: string;
  /** Shown as a tooltip (also on disabled buttons, e.g. "即将接入"). */
  title?: string;
}) {
  return (
    <motion.button
      type="button"
      className={cn(styles.button, styles[variant], className)}
      onClick={onClick}
      disabled={disabled}
      data-tooltip={title}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      {children}
    </motion.button>
  );
}
