'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import styles from './Menu.module.css';

export type MenuItem =
  | { type?: 'item'; label: string; icon?: ReactNode; hint?: string; danger?: boolean; disabled?: boolean; onSelect: () => void }
  | { type: 'section'; label: string }
  | { type: 'divider' };

type Anchor = RefObject<HTMLElement | null> | HTMLElement | null;
const resolveAnchor = (anchor: Anchor) => (anchor && 'current' in anchor ? anchor.current : anchor);

/**
 * Popover menu anchored to an element (opens below, flips up near the bottom).
 * Pass either a ref to the trigger or a captured element (e.g. from a context-menu event).
 * Closes on outside click, Escape, scroll or selection.
 */
export function Menu({ open, anchor, items, onClose, align = 'start' }: { open: boolean; anchor: Anchor; items: MenuItem[]; onClose: () => void; align?: 'start' | 'end' }) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; origin: string } | null>(null);

  useLayoutEffect(() => {
    const target = resolveAnchor(anchor);
    if (!open || !target) return;
    const rect = target.getBoundingClientRect();
    const height = panel.current?.offsetHeight ?? 240;
    const width = panel.current?.offsetWidth ?? 200;
    const below = rect.bottom + 6 + height < window.innerHeight - 12;
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, align === 'end' ? rect.right - width : rect.left));
    setPosition({ top: below ? rect.bottom + 6 : rect.top - 6 - height, left, origin: `${align === 'end' ? 'right' : 'left'} ${below ? 'top' : 'bottom'}` });
  }, [open, anchor, align, items.length]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (panel.current?.contains(event.target as Node) || resolveAnchor(anchor)?.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const onScroll = (event: Event) => { if (!panel.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, anchor, onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panel}
          role="menu"
          className={styles.menu}
          data-scroll-native
          style={{ top: position?.top ?? -9999, left: position?.left ?? -9999, transformOrigin: position?.origin }}
          initial={{ opacity: 0, scale: 0.94, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
        >
          {items.map((item, index) => {
            if (item.type === 'divider') return <div key={`d${index}`} className={styles.divider} role="separator" />;
            if (item.type === 'section') return <div key={`s${index}`} className={styles.section}>{item.label}</div>;
            return (
              <button
                key={`${item.label}${index}`}
                type="button"
                role="menuitem"
                className={cn(styles.item, item.danger && styles.danger)}
                disabled={item.disabled}
                onClick={() => { onClose(); item.onSelect(); }}
              >
                {item.icon && <span className={styles.icon}>{item.icon}</span>}
                <span className={styles.label}>{item.label}</span>
                {item.hint && <span className={styles.hint}>{item.hint}</span>}
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
