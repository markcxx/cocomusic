'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import styles from './Popover.module.css';

/**
 * Free-form panel anchored to a trigger (opens below it, flips above near the
 * bottom). Closes on outside click or Escape. Use `Menu` for plain item lists.
 */
export function Popover({ open, anchor, onClose, label, width = 320, children }: {
  open: boolean;
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  label: string;
  width?: number;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const target = anchor.current;
    if (!open || !target) return;
    const rect = target.getBoundingClientRect();
    const height = panel.current?.offsetHeight ?? 360;
    const below = rect.bottom + 8 + height < window.innerHeight - 12;
    setPosition({
      top: below ? rect.bottom + 8 : Math.max(12, rect.top - 8 - height),
      left: Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width)),
    });
  }, [open, anchor, width]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const node = event.target as Node;
      // Pickers opened from inside the panel render in their own portal: leave those alone.
      if (panel.current?.contains(node) || anchor.current?.contains(node) || (node as Element).closest?.('[data-popover-nested]')) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); window.removeEventListener('keydown', onKey); };
  }, [open, anchor, onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panel}
          role="dialog"
          aria-label={label}
          className={styles.popover}
          data-scroll-native
          style={{ width, top: position?.top ?? -9999, left: position?.left ?? -9999 }}
          initial={{ opacity: 0, y: -4, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
