'use client';

import { useState } from 'react';
import { Checkbox, Dialog, DialogActions } from '@/components/ui';
import type { UserPlaylist } from '@/lib/account-client';
import { useAccount } from './account-store';
import styles from './CreatePlaylistDialog.module.css';

const MAX = 40;

export function CreatePlaylistDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (playlist: UserPlaylist) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="新建歌单">
      {/* Mounted only while open, so every opening starts with a fresh form. */}
      {open && <CreatePlaylistForm onClose={onClose} onCreated={onCreated} />}
    </Dialog>
  );
}

function CreatePlaylistForm({ onClose, onCreated }: { onClose: () => void; onCreated?: (playlist: UserPlaylist) => void }) {
  const { createPlaylist } = useAccount();
  const [name, setName] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    setError('');
    try {
      const playlist = await createPlaylist(value, privacy);
      onCreated?.(playlist);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className={styles.field}>
        <input value={name} maxLength={MAX} onChange={event => setName(event.target.value)} placeholder="输入歌单名称" aria-label="歌单名称" />
        <span className={styles.counter}>{name.length}/{MAX}</span>
      </label>
      <div className={styles.private} onClick={() => setPrivacy(value => (value === 'private' ? 'public' : 'private'))}>
        {/* Checkbox stops propagation itself; the row text toggles via the div. */}
        <Checkbox checked={privacy === 'private'} onChange={() => setPrivacy(value => (value === 'private' ? 'public' : 'private'))} label="设为隐私歌单" />
        设为隐私歌单（仅自己可见）
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <DialogActions onCancel={onClose} onConfirm={() => void submit()} confirmLabel={busy ? '创建中…' : '创建'} busy={busy} disabled={!name.trim()} />
    </form>
  );
}
