'use client';

import { useState } from 'react';
import { ConfirmDialog, Dialog, DialogActions } from '@/components/ui';
import type { UserPlaylist } from '@/lib/account-client';
import { useAccount } from './account-store';
import styles from './CreatePlaylistDialog.module.css';

const MAX = 40;

export function RenamePlaylistDialog({ playlist, onClose }: { playlist: UserPlaylist | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(playlist)} onClose={onClose} title="重命名歌单">
      {playlist && <RenameForm key={playlist.id} playlist={playlist} onClose={onClose} />}
    </Dialog>
  );
}

function RenameForm({ playlist, onClose }: { playlist: UserPlaylist; onClose: () => void }) {
  const { renamePlaylist } = useAccount();
  const [name, setName] = useState(playlist.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const value = name.trim();
  const unchanged = value === playlist.name;

  const submit = async () => {
    if (!value || unchanged || busy) return;
    setBusy(true);
    setError('');
    try {
      await renamePlaylist(playlist.id, value);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '重命名失败');
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className={styles.field}>
        <input value={name} maxLength={MAX} onChange={event => setName(event.target.value)} onFocus={event => event.currentTarget.select()} aria-label="歌单名称" />
        <span className={styles.counter}>{name.length}/{MAX}</span>
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <DialogActions onCancel={onClose} onConfirm={() => void submit()} confirmLabel={busy ? '保存中…' : '保存'} busy={busy} disabled={!value || unchanged} />
    </form>
  );
}

/** Built on the shared ConfirmDialog; errors stay inline and the dialog remains open. */
export function DeletePlaylistDialog({ playlist, onClose, onDeleted }: { playlist: UserPlaylist | null; onClose: () => void; onDeleted?: (id: string) => void }) {
  const { deletePlaylist } = useAccount();
  // Keep the name while the close animation plays (playlist becomes null first).
  const [shown, setShown] = useState(playlist);
  if (playlist && playlist !== shown) setShown(playlist);

  return (
    <ConfirmDialog
      open={Boolean(playlist)}
      onClose={onClose}
      title="删除歌单"
      tone="danger"
      confirmLabel="删除"
      message={<>确定删除歌单「{shown?.name}」吗？歌单内的歌曲不会被删除，但此操作无法撤销。</>}
      onConfirm={async () => {
        if (!playlist) return;
        await deletePlaylist(playlist.id);
        onDeleted?.(playlist.id);
      }}
    />
  );
}
