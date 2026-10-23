'use client';

import { motion, useTransform } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useScrollArea } from './ScrollArea';
import styles from './CollapsingHeader.module.css';

/**
 * Page title that shrinks, lifts and fades as the page scrolls, finishing over
 * `distance` pixels. Pair with <StickyBar> to keep filters pinned below it.
 */
export function CollapsingHeader({ title, subtitle, actions, distance = 90, className }: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  distance?: number;
  className?: string;
}) {
  const { scrollY } = useScrollArea();
  const progress = useTransform(scrollY, [0, distance], [0, 1], { clamp: true });
  const scale = useTransform(progress, [0, 1], [1, 0.72]);
  const y = useTransform(progress, [0, 1], [0, -14]);
  const opacity = useTransform(progress, [0, 0.7, 1], [1, 0.35, 0]);
  const subtitleOpacity = useTransform(progress, [0, 0.4], [1, 0]);
  const blur = useTransform(progress, [0.4, 1], ['blur(0px)', 'blur(3px)']);

  return (
    <header className={cn(styles.header, className)}>
      <motion.div className={styles.titles} style={{ scale, y, opacity, filter: blur }}>
        <h1>{title}</h1>
        {subtitle && <motion.p style={{ opacity: subtitleOpacity }}>{subtitle}</motion.p>}
      </motion.div>
      {actions && <motion.div className={styles.actions} style={{ opacity, y }}>{actions}</motion.div>}
    </header>
  );
}
