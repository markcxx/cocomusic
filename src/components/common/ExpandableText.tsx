'use client';

import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import styles from './ExpandableText.module.css';

/**
 * Multi-line text clamped to `lines`, with an animated height expand/collapse.
 * The toggle appears only when the text actually overflows.
 */
export function ExpandableText({ text, lines = 2, lineHeight = 22, className }: { text: string; lines?: number; lineHeight?: number; className?: string }) {
  const inner = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(0);
  const [open, setOpen] = useState(false);
  const collapsed = lines * lineHeight;

  useLayoutEffect(() => {
    const node = inner.current;
    if (!node) return;
    const measure = () => setFull(node.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);

  const overflows = full > collapsed + 2;
  return (
    <div className={cn(styles.wrap, className)}>
      <motion.div
        className={styles.clip}
        initial={false}
        animate={{ height: open || !overflows ? full || 'auto' : collapsed }}
        transition={{ type: 'spring', stiffness: 260, damping: 32 }}
        style={{ lineHeight: `${lineHeight}px` }}
      >
        <div ref={inner} className={styles.text}>{text}</div>
        {overflows && <motion.span className={styles.fade} animate={{ opacity: open ? 0 : 1 }} aria-hidden />}
      </motion.div>
      {overflows && (
        <button type="button" className={styles.toggle} onClick={() => setOpen(value => !value)} aria-expanded={open}>
          {open ? '收起' : '展开'}
          <motion.span className={styles.chevron} animate={{ rotate: open ? 180 : 0 }}>
            <ChevronDown size={14} strokeWidth={1.6} />
          </motion.span>
        </button>
      )}
    </div>
  );
}
