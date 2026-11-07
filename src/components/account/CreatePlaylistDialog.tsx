'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui';
import { PlaylistNameForm, PlaylistNameOption } from '@/components/playlists/PlaylistNameForm';
import type { UserPlaylist } from '@/lib/account-client';
import { useAccount } from './account-store';

/** New playlist on the signed-in platform account. */
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
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  return (
    <PlaylistNameForm
      confirmLabel="创建"
      busyLabel="创建中…"
      onCancel={onClose}
      onSubmit={async name => {
        const playlist = await createPlaylist(name, privacy);
        onCreated?.(playlist);
        onClose();
      }}
    >
      <PlaylistNameOption checked={privacy === 'private'} onChange={checked => setPrivacy(checked ? 'private' : 'public')} label="设为隐私歌单（仅自己可见）" />
    </PlaylistNameForm>
  );
}
