'use client';

import { HeartOff, Link2, PencilLine, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigation } from '@/components/layout/navigation';
import { usePlayer } from '@/components/player/player-store';
import { GroupAddButton, SidebarGroupShell, SidebarHint, SidebarPlaylistGroup, type SidebarRow } from '@/components/playlists/SidebarPlaylistGroup';
import { toast, type MenuItem } from '@/components/ui';
import type { UserPlaylist } from '@/lib/account-client';
import { catalogApi } from '@/lib/catalog-client';
import { shareUrl } from '@/lib/share-links';
import { toTrack } from '@/lib/to-track';
import { useAccount } from './account-store';
import { CreatePlaylistDialog } from './CreatePlaylistDialog';
import { DeletePlaylistDialog, RenamePlaylistDialog } from './PlaylistDialogs';

const toRow = (playlist: UserPlaylist): SidebarRow => ({ id: playlist.id, name: playlist.name, seed: `${playlist.source}:${playlist.id}`, cover: playlist.cover, locked: playlist.privacy === 'private' });

/** Row actions shared by the hover "更多" button and the context menu. */
function usePlaylistActions(onRename: (playlist: UserPlaylist) => void, onDelete: (playlist: UserPlaylist) => void) {
  const player = usePlayer();
  const { toggleSubscribe } = useAccount();

  const playAll = async (playlist: UserPlaylist) => {
    try {
      const detail = await catalogApi.playlist(playlist.id, 0, 200);
      const queue = detail.tracks.map(toTrack);
      if (!queue[0]) { toast.info('歌单里还没有歌曲'); return; }
      player.play(queue[0], queue);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '歌单加载失败');
    }
  };

  const copyLink = async (playlist: UserPlaylist) => {
    try {
      await navigator.clipboard.writeText(shareUrl(playlist.source, 'playlist', playlist.id));
      toast.success('链接已复制');
    } catch {
      toast.error('复制失败');
    }
  };

  return (playlist: UserPlaylist): MenuItem[] => [
    { label: '播放歌单', icon: <Play size={15} strokeWidth={1.5} />, onSelect: () => void playAll(playlist) },
    { label: '复制链接', icon: <Link2 size={15} strokeWidth={1.5} />, onSelect: () => void copyLink(playlist) },
    { type: 'divider' },
    ...(playlist.own
      ? [
          { label: '重命名', icon: <PencilLine size={15} strokeWidth={1.5} />, onSelect: () => onRename(playlist) },
          { label: '删除歌单', icon: <Trash2 size={15} strokeWidth={1.5} />, danger: true, onSelect: () => onDelete(playlist) },
        ] satisfies MenuItem[]
      : [{ label: '取消收藏', icon: <HeartOff size={15} strokeWidth={1.5} />, danger: true, onSelect: () => void toggleSubscribe(playlist) }] satisfies MenuItem[]),
  ];
}

/** 我的歌单 / 收藏的歌单 from the logged-in account; prompts login otherwise. */
export function SidebarPlaylists({ collapsed = false }: { collapsed?: boolean }) {
  const { profile, playlists, openLogin } = useAccount();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<UserPlaylist | null>(null);
  const [deleting, setDeleting] = useState<UserPlaylist | null>(null);
  const { route, navigate } = useNavigation();
  const actionsFor = usePlaylistActions(setRenaming, setDeleting);

  // 我喜欢的音乐 lives under 我喜欢 in the nav, so it is not repeated here.
  const own = playlists.filter(item => item.own && !item.liked);
  const subscribed = playlists.filter(item => !item.own);
  const byId = new Map(playlists.map(item => [item.id, item]));
  const create = <GroupAddButton label="新建歌单" onClick={() => (profile ? setCreating(true) : openLogin())} />;

  if (!profile) {
    return (
      <SidebarGroupShell title="我的歌单" action={create} collapsed={collapsed}>
        <SidebarHint onClick={openLogin} disabled={profile === undefined}>登录后同步你的歌单</SidebarHint>
      </SidebarGroupShell>
    );
  }

  // The account's playlists belong to the selected platform: routes without a source.
  const group = {
    collapsed,
    isActive: (row: SidebarRow) => route.name === 'playlist' && !route.source && route.id === row.id,
    onOpen: (row: SidebarRow) => navigate({ name: 'playlist', id: row.id, title: row.name }),
    menuFor: (row: SidebarRow) => actionsFor(byId.get(row.id)!),
  };
  return (
    <>
      <SidebarPlaylistGroup title="创建的歌单" rows={own.map(toRow)} action={create} {...group} />
      {subscribed.length > 0 && <SidebarPlaylistGroup title="收藏的歌单" rows={subscribed.map(toRow)} {...group} />}
      <CreatePlaylistDialog open={creating} onClose={() => setCreating(false)} onCreated={playlist => navigate({ name: 'playlist', id: playlist.id, title: playlist.name })} />
      <RenamePlaylistDialog playlist={renaming} onClose={() => setRenaming(null)} />
      <DeletePlaylistDialog
        playlist={deleting}
        onClose={() => setDeleting(null)}
        // Leave the page of a playlist that no longer exists.
        onDeleted={id => { if (route.name === 'playlist' && route.id === id) navigate({ name: 'home' }); }}
      />
    </>
  );
}
