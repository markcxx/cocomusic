'use client';

import { motion, useTransform } from 'framer-motion';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useScrollArea } from './ScrollArea';
import styles from './StickyBar.module.css';

/** Distance from the scroll root's content top to `element`, through offset parents. */
function offsetWithin(element: HTMLElement) {
  let top = 0;
  let node: HTMLElement | null = element;
  while (node && !node.dataset.scrollRoot) {
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return top;
}

/**
 * Pins its children to the top of the scroll area once scrolled past, in the
 * same visual layer as the page (no card). When stuck it takes the sheet's
 * fill plus a hairline, and can fade in a compact title on the left.
 */
export function StickyBar({ children, compactTitle, className }: { children: ReactNode; compactTitle?: ReactNode; className?: string }) {
  const { scrollY } = useScrollArea();
  // A zero-height marker just before the bar: unlike the sticky bar itself it never moves.
  const marker = useRef<HTMLSpanElement>(null);
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    const element = marker.current;
    if (!element) return;
    const measure = () => setOffset(offsetWithin(element));
    measure();
    const observer = new ResizeObserver(measure);
    if (element.parentElement) observer.observe(element.parentElement);
    return () => observer.disconnect();
  }, []);

  // Fill fades in only as content starts sliding under the pinned bar.
  const surface = useTransform(scrollY, [offset - 8, offset + 12], [0, 1], { clamp: true });
  const titleOpacity = useTransform(scrollY, [offset - 4, offset + 30], [0, 1], { clamp: true });
  const titleX = useTransform(titleOpacity, [0, 1], [-8, 0]);
  const titleWidth = useTransform(titleOpacity, [0, 1], [0, 220]);

  return (
    <>
      <span ref={marker} className={styles.marker} aria-hidden />
      <div className={cn(styles.bar, className)}>
        <motion.div className={styles.surface} style={{ opacity: surface }} aria-hidden />
        <motion.div className={styles.divider} style={{ opacity: surface }} aria-hidden />
        {compactTitle && (
          <motion.span className={styles.compactTitle} style={{ opacity: titleOpacity, x: titleX, maxWidth: titleWidth }} aria-hidden>{compactTitle}</motion.span>
        )}
        <div className={styles.content}>{children}</div>
      </div>
    </>
  );
}
