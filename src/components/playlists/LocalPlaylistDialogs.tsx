'use client';

import { useState } from 'react';
import { ConfirmDialog, Dialog, toast } from '@/components/ui';
import { localPlaylists, type LocalPlaylist } from '@/lib/local-playlists';
import type { Track } from '@/types/music';
import { PlaylistNameForm, PlaylistNameNote } from './PlaylistNameForm';

/** What a new local playlist starts with; null keeps the dialog closed. */
export type LocalPlaylistDraft = { tracks: Track[]; name?: string } | null;

/** New 本地歌单, optionally seeded with songs (selected rows, the play queue…). */
export function CreateLocalPlaylistDialog({ draft, onClose, onCreated }: { draft: LocalPlaylistDraft; onClose: () => void; onCreated?: (playlist: LocalPlaylist) => void }) {
  const count = draft?.tracks.length ?? 0;
  return (
    <Dialog open={Boolean(draft)} onClose={onClose} title="新建本地歌单">
      {draft && (
        <PlaylistNameForm
          initialName={draft.name}
          confirmLabel="创建"
          busyLabel="创建中…"
          onCancel={onClose}
          onSubmit={name => {
            const playlist = localPlaylists.create({ name, tracks: draft.tracks });
            toast.success(count ? `已创建「${playlist.name}」，包含 ${playlist.tracks.length} 首歌曲` : `已创建本地歌单「${playlist.name}」`);
            onCreated?.(playlist);
            onClose();
          }}
        >
          <PlaylistNameNote>{count ? `将保存 ${count} 首歌曲。` : ''}本地歌单保存在这台电脑上，无需登录，可以混合不同平台的歌曲和本地文件。</PlaylistNameNote>
        </PlaylistNameForm>
      )}
    </Dialog>
  );
}

export function RenameLocalPlaylistDialog({ playlist, onClose }: { playlist: LocalPlaylist | null; onClose: () => void }) {
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
          onSubmit={name => { localPlaylists.rename(playlist.id, name); toast.success('歌单已重命名'); onClose(); }}
        />
      )}
    </Dialog>
  );
}

export function DeleteLocalPlaylistDialog({ playlist, onClose, onDeleted }: { playlist: LocalPlaylist | null; onClose: () => void; onDeleted?: (id: string) => void }) {
  // Keep the name while the close animation plays (playlist becomes null first).
  const [shown, setShown] = useState(playlist);
  if (playlist && playlist !== shown) setShown(playlist);
  return (
    <ConfirmDialog
      open={Boolean(playlist)}
      onClose={onClose}
      title="删除本地歌单"
      tone="danger"
      confirmLabel="删除"
      message={<>确定删除「{shown?.name}」吗？歌曲本身和本地文件不受影响，但此操作无法撤销。</>}
      onConfirm={() => {
        if (!playlist) return;
        localPlaylists.remove(playlist.id);
        toast.info('歌单已删除');
        onDeleted?.(playlist.id);
      }}
    />
  );
}
