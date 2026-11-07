'use client';

import { useState } from 'react';
import { ConfirmDialog, Dialog } from '@/components/ui';
import { PlaylistNameForm } from '@/components/playlists/PlaylistNameForm';
import type { UserPlaylist } from '@/lib/account-client';
import { useAccount } from './account-store';

export function RenamePlaylistDialog({ playlist, onClose }: { playlist: UserPlaylist | null; onClose: () => void }) {
  const { renamePlaylist } = useAccount();
  return (
    <Dialog open={Boolean(playlist)} onClose={onClose} title="重命名歌单">
      {playlist && (
        <PlaylistNameForm
          key={playlist.id}
          initialName={playlist.name}
          requireChange
          confirmLabel="保存"
          busyLabel="保存中…"
          onCancel={onClose}
          onSubmit={async name => { await renamePlaylist(playlist.id, name); onClose(); }}
        />
      )}
    </Dialog>
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
