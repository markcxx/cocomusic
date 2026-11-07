'use client';

import { Copy, Download, ListEnd, ListMinus, ListStart, MoreHorizontal } from 'lucide-react';
import { useRef, useState } from 'react';
import { downloads } from '@/components/downloads/download-store';
import { usePlayer } from '@/components/player/player-store';
import { useAddToPlaylist, type PlaylistRef } from '@/components/playlists/add-to-playlist';
import { IconButton, Menu, toast, type MenuItem } from '@/components/ui';
import { accountApi } from '@/lib/account-client';
import { downloadsApi } from '@/lib/local-client';
import { localPlaylists } from '@/lib/local-playlists';
import { toCatalogTrack } from '@/lib/to-track';
import type { Track } from '@/types/music';
import { useAccount } from './account-store';

/**
 * Per-track "更多" menu: queue, download, add to a playlist (本地歌单 or the
 * account's own), remove from the playlist being shown, copy info.
 */
export function TrackMenuButton({ track, playlist, onRemoved }: { track: Track; playlist?: PlaylistRef; onRemoved?: (trackId: string) => void }) {
  const { isOwnPlaylist } = useAccount();
  const player = usePlayer();
  const addTo = useAddToPlaylist();
  const button = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const catalog = toCatalogTrack(track);
  const removable = playlist && (playlist.kind === 'local' || isOwnPlaylist(playlist.id));

  const remove = async () => {
    if (!playlist) return;
    try {
      if (playlist.kind === 'local') localPlaylists.removeTracks(playlist.id, [track.id]);
      else await accountApi.editTracks(playlist.id, [catalog?.id ?? ''], 'del');
      onRemoved?.(track.id);
      toast.success('已从歌单移除');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '移除失败');
    }
  };

  const items: MenuItem[] = [
    { label: '下一首播放', icon: <ListStart size={15} strokeWidth={1.5} />, onSelect: () => { player.playNext([track]); toast.success('将在下一首播放'); } },
    { label: '加入播放列表', icon: <ListEnd size={15} strokeWidth={1.5} />, onSelect: () => { player.enqueue([track]); toast.success('已加入播放列表'); } },
    ...(catalog ? [
      { label: '下载', icon: <Download size={15} strokeWidth={1.5} />, onSelect: () => void downloads.add([catalog]) },
      { label: '下载歌词', icon: <Download size={15} strokeWidth={1.5} />, onSelect: async () => {
        try { await downloadsApi.lyrics(catalog); toast.success('歌词已保存到下载目录'); }
        catch (error) { toast.error(error instanceof Error ? error.message : '歌词下载失败'); }
      } },
    ] satisfies MenuItem[] : []),
    { type: 'divider' },
    ...addTo.items([track], { exclude: playlist }),
    { type: 'divider' },
    ...(removable ? [{ label: '从歌单中移除', icon: <ListMinus size={15} strokeWidth={1.5} />, danger: true, onSelect: () => void remove() } satisfies MenuItem] : []),
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
      {addTo.dialogs}
    </>
  );
}
