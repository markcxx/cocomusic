'use client';

import { useState, type ReactNode } from 'react';
import { Checkbox, DialogActions } from '@/components/ui';
import { PLAYLIST_NAME_MAX } from '@/lib/local-playlists';
import styles from './PlaylistNameForm.module.css';

/**
 * Name field + 取消/确认 for creating or renaming any playlist (platform or
 * local). `onSubmit` may be async; errors show inline and the form stays open.
 * `children` add fields below the name (e.g. 设为隐私歌单).
 */
export function PlaylistNameForm({ initialName = '', confirmLabel, busyLabel, requireChange = false, onSubmit, onCancel, children }: {
  initialName?: string;
  confirmLabel: string;
  busyLabel: string;
  /** Renaming: the unchanged name cannot be submitted. */
  requireChange?: boolean;
  onSubmit: (name: string) => void | Promise<void>;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const value = name.trim();
  const blocked = !value || (requireChange && value === initialName);

  const submit = async () => {
    if (blocked || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className={styles.field}>
        <input
          value={name}
          maxLength={PLAYLIST_NAME_MAX}
          onChange={event => setName(event.target.value)}
          // Renaming or a suggested name: select it so typing replaces it.
          onFocus={initialName ? event => event.currentTarget.select() : undefined}
          placeholder="输入歌单名称"
          aria-label="歌单名称"
        />
        <span className={styles.counter}>{name.length}/{PLAYLIST_NAME_MAX}</span>
      </label>
      {children}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <DialogActions onCancel={onCancel} onConfirm={() => void submit()} confirmLabel={busy ? busyLabel : confirmLabel} busy={busy} disabled={blocked} />
    </form>
  );
}

/** Checkbox row under the name field; clicking the text toggles it as well. */
export function PlaylistNameOption({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <div className={styles.option} onClick={() => onChange(!checked)}>
      {/* Checkbox stops propagation itself; the row text toggles via the div. */}
      <Checkbox checked={checked} onChange={() => onChange(!checked)} label={label} />
      {label}
    </div>
  );
}

/** One line of context under the name field (e.g. which songs the new playlist starts with). */
export function PlaylistNameNote({ children }: { children: ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}
