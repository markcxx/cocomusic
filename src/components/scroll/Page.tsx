import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import styles from './Page.module.css';

/** Standard page body inside the content sheet: shared padding and vertical rhythm. */
export function Page({ children, className, gap = 'md' }: { children: ReactNode; className?: string; gap?: 'sm' | 'md' }) {
  return <div className={cn(styles.page, gap === 'sm' && styles.tight, className)}>{children}</div>;
}
