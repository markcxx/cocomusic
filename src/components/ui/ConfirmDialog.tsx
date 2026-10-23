'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Dialog } from './Dialog';
import { Spinner } from './Spinner';
import styles from './Dialog.module.css';

/**
 * Footer button pair for dialogs. Both buttons share one size and baseline;
 * `tone="danger"` paints the confirm button red for destructive actions.
 */
export function DialogActions({ onCancel, onConfirm, confirmLabel, cancelLabel = '取消', busy = false, disabled = false, tone = 'primary' }: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  /** Shows a spinner in the confirm button and blocks both buttons. */
  busy?: boolean;
  disabled?: boolean;
  tone?: 'primary' | 'danger';
}) {
  return (
    <div className={styles.actions}>
      <button type="button" className={cn(styles.action, styles.cancel)} onClick={onCancel} disabled={busy}>{cancelLabel}</button>
      <button type="submit" className={cn(styles.action, tone === 'danger' ? styles.danger : styles.confirm)} onClick={event => { event.preventDefault(); onConfirm(); }} disabled={busy || disabled} aria-busy={busy}>
        {busy && <Spinner size={14} />}
        {confirmLabel}
      </button>
    </div>
  );
}

/**
 * Confirmation modal: title, message, cancel/confirm. `onConfirm` may be async;
 * the dialog stays open with a spinner until it settles, shows its error inline
 * on failure, and closes on success.
 */
export function ConfirmDialog({ open, onClose, title, message, confirmLabel = '确定', tone = 'primary', onConfirm }: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => { if (busy) return; setError(''); onClose(); };
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      setBusy(false);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败，请稍后重试');
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} title={title} width={400}>
      <form className={styles.body} onSubmit={event => { event.preventDefault(); void confirm(); }}>
        <div className={styles.message}>{message}</div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <DialogActions onCancel={close} onConfirm={() => void confirm()} confirmLabel={busy ? `${confirmLabel}中…` : confirmLabel} busy={busy} tone={tone} />
      </form>
    </Dialog>
  );
}
