'use client';

import { PencilLine, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigation } from '@/components/layout/navigation';
import { usePlayer } from '@/components/player/player-store';
import { toast, type MenuItem } from '@/components/ui';
import { localPlaylistCover, localPlaylists, useLocalPlaylists, type LocalPlaylist } from '@/lib/local-playlists';
import { CreateLocalPlaylistDialog, DeleteLocalPlaylistDialog, RenameLocalPlaylistDialog, type LocalPlaylistDraft } from './LocalPlaylistDialogs';
import { GroupAddButton, SidebarPlaylistGroup, type SidebarRow } from './SidebarPlaylistGroup';

const toRow = (playlist: LocalPlaylist): SidebarRow => ({ id: playlist.id, name: playlist.name, seed: `local-playlist:${playlist.id}`, cover: localPlaylistCover(playlist) });

/** 本地歌单: always shown (no login), whatever platform is selected. */
export function SidebarLocalPlaylists({ collapsed = false }: { collapsed?: boolean }) {
  const playlists = useLocalPlaylists();
  const player = usePlayer();
  const { route, navigate } = useNavigation();
  const [draft, setDraft] = useState<LocalPlaylistDraft>(null);
  const [renaming, setRenaming] = useState<LocalPlaylist | null>(null);
  const [deleting, setDeleting] = useState<LocalPlaylist | null>(null);

  const menuFor = (row: SidebarRow): MenuItem[] => {
    const playlist = localPlaylists.get(row.id);
    if (!playlist) return [];
    return [
      { label: '播放歌单', icon: <Play size={15} strokeWidth={1.5} />, onSelect: () => {
        if (!playlist.tracks[0]) { toast.info('歌单里还没有歌曲'); return; }
        player.play(playlist.tracks[0], playlist.tracks);
      } },
      { type: 'divider' },
      { label: '重命名', icon: <PencilLine size={15} strokeWidth={1.5} />, onSelect: () => setRenaming(playlist) },
      { label: '删除歌单', icon: <Trash2 size={15} strokeWidth={1.5} />, danger: true, onSelect: () => setDeleting(playlist) },
    ];
  };

  return (
    <>
      <SidebarPlaylistGroup
        title="本地歌单"
        rows={playlists.map(toRow)}
        action={<GroupAddButton label="新建本地歌单" onClick={() => setDraft({ tracks: [] })} />}
        collapsed={collapsed}
        isActive={row => route.name === 'local-playlist' && route.id === row.id}
        onOpen={row => navigate({ name: 'local-playlist', id: row.id, title: row.name })}
        menuFor={menuFor}
        emptyText="无需登录，可混合各平台歌曲"
      />
      <CreateLocalPlaylistDialog draft={draft} onClose={() => setDraft(null)} onCreated={playlist => navigate({ name: 'local-playlist', id: playlist.id, title: playlist.name })} />
      <RenameLocalPlaylistDialog playlist={renaming} onClose={() => setRenaming(null)} />
      <DeleteLocalPlaylistDialog
        playlist={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={id => { if (route.name === 'local-playlist' && route.id === id) navigate({ name: 'home' }); }}
      />
    </>
  );
}
