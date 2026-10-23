'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { staggerList } from '@/components/common/motion';
import { PlaylistSkeleton } from '@/components/home/skeletons';
import { cn } from '@/lib/cn';
import styles from './CardGrid.module.css';

/** Six-column cover grid with staggered entrance; shows skeleton cards while loading. */
export function CardGrid({ children, loading, skeletonCount = 12, variant = 'cover', className }: {
  children: ReactNode;
  loading?: boolean;
  skeletonCount?: number;
  variant?: 'cover' | 'artist';
  className?: string;
}) {
  if (loading) return <PlaylistSkeleton count={skeletonCount} />;
  return (
    <motion.div className={cn(styles.grid, variant === 'artist' && styles.artists, className)} variants={staggerList} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}
