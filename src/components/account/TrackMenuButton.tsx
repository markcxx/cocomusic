'use client';

import { Copy, Download, ListEnd, ListMinus, ListPlus, ListStart, MoreHorizontal, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { downloads } from '@/components/downloads/download-store';
import { usePlayer } from '@/components/player/player-store';
import { IconButton, Menu, toast, type MenuItem } from '@/components/ui';
import { accountApi } from '@/lib/account-client';
import type { CatalogTrack } from '@/lib/catalog-client';
import { toTrack } from '@/lib/to-track';
import { useAccount } from './account-store';
import { CreatePlaylistDialog } from './CreatePlaylistDialog';

/** Per-track "更多" menu: add to own playlist (or a new one), remove from the current own playlist, copy info. */
export function TrackMenuButton({ track, playlistId, onRemoved }: { track: CatalogTrack; playlistId?: string; onRemoved?: (trackId: string) => void }) {
  const { profile, playlists, addToPlaylist, isOwnPlaylist, openLogin } = useAccount();
  const player = usePlayer();
  const button = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const own = playlists.filter(item => item.own && item.id !== playlistId);

  const items: MenuItem[] = [
    { label: '下一首播放', icon: <ListStart size={15} strokeWidth={1.5} />, onSelect: () => { player.playNext([toTrack(track)]); toast.success('将在下一首播放'); } },
    { label: '加入播放列表', icon: <ListEnd size={15} strokeWidth={1.5} />, onSelect: () => { player.enqueue([toTrack(track)]); toast.success('已加入播放列表'); } },
    { label: '下载', icon: <Download size={15} strokeWidth={1.5} />, onSelect: () => void downloads.add([track]) },
    { type: 'divider' },
    { type: 'section', label: '添加到歌单' },
    { label: '新建歌单…', icon: <Plus size={15} strokeWidth={1.5} />, onSelect: () => (profile ? setCreating(true) : openLogin()) },
    ...own.map((item): MenuItem => ({
      label: item.liked ? '我喜欢的音乐' : item.name,
      icon: <ListPlus size={15} strokeWidth={1.5} />,
      hint: item.trackCount !== undefined ? `${item.trackCount}` : undefined,
      onSelect: () => void addToPlaylist(item.id, [track.id]),
    })),
    { type: 'divider' },
    ...(playlistId && isOwnPlaylist(playlistId) ? [{
      label: '从歌单中移除',
      icon: <ListMinus size={15} strokeWidth={1.5} />,
      danger: true,
      onSelect: async () => {
        try {
          await accountApi.editTracks(playlistId, [track.id], 'del');
          onRemoved?.(track.id);
          toast.success('已从歌单移除');
        } catch (error) {
          toast.error(error instanceof Error ? error.message : '移除失败');
        }
      },
    } satisfies MenuItem] : []),
    { label: '复制歌曲信息', icon: <Copy size={15} strokeWidth={1.5} />, onSelect: async () => {
      try { await navigator.clipboard.writeText(`${track.title} - ${track.artist}`); toast.success('已复制'); } catch { toast.error('复制失败'); }
    } },
  ];

  return (
    <>
      <span ref={button} style={{ display: 'inline-flex' }}>
        <IconButton label="更多操作" size="sm" tone="muted" onClick={() => setOpen(value => !value)}>
          <MoreHorizontal size={16} strokeWidth={1.4} />
        </IconButton>
      </span>
      <Menu open={open} anchor={button} items={items} onClose={() => setOpen(false)} align="end" />
      <CreatePlaylistDialog open={creating} onClose={() => setCreating(false)} onCreated={playlist => void addToPlaylist(playlist.id, [track.id])} />
    </>
  );
}
