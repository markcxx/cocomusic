'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './IconButton';
import styles from './Dialog.module.css';

/** Centered modal with a soft scrim. Escape / scrim click closes; focus returns on close. */
export function Dialog({ open, onClose, title, children, width }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; width?: number }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('input, button:not([data-dialog-close])')?.focus() ?? panel.current?.focus());
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className={styles.overlay} onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={styles.dialog}
            style={width ? { width: `min(${width}px, calc(100vw - 48px))` } : undefined}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            {title && <h2 className={styles.title}>{title}</h2>}
            <span className={styles.close} data-dialog-close>
              <IconButton label="关闭" onClick={onClose} iconHover={{ rotate: 90 }} tone="muted">
                <X size={17} strokeWidth={1.5} />
              </IconButton>
            </span>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
