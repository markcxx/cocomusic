'use client';

import { ListPlus, Plus, SquarePlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useAccount } from '@/components/account/account-store';
import { CreatePlaylistDialog } from '@/components/account/CreatePlaylistDialog';
import { IconButton, Menu, type MenuItem } from '@/components/ui';
import { useSettings } from '@/lib/settings';
import { usePlayer } from './player-store';

export function AddToPlaylistButton() {
  const { profile, playlists, addToPlaylist, openLogin } = useAccount();
  const platform = useSettings().catalogSource;
  const { track } = usePlayer();
  const anchor = useRef<HTMLSpanElement>(null);
  // Keep the intended song even if playback advances while choosing or creating a playlist.
  const [songId, setSongId] = useState<string | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const foreign = (track.source ?? 'netease') !== platform && Boolean(track.songId);
  const items: MenuItem[] = songId ? [
    { type: 'section', label: '添加到歌单' },
    { label: '新建歌单…', icon: <Plus size={15} strokeWidth={1.5} />, onSelect: () => setCreatingFor(songId) },
    ...playlists.filter(item => item.own).map((item): MenuItem => ({
      label: item.liked ? '我喜欢的音乐' : item.name,
      icon: <ListPlus size={15} strokeWidth={1.5} />,
      hint: item.trackCount !== undefined ? String(item.trackCount) : undefined,
      onSelect: () => void addToPlaylist(item.id, [songId]),
    })),
  ] : [];

  return (
    <>
      <span ref={anchor} style={{ display: 'inline-flex' }}>
        <IconButton
          label={foreign ? '其他平台的歌曲，切换到该平台后可收藏' : '收藏到歌单'}
          tone="muted"
          disabled={!track.songId || foreign}
          aria-haspopup="menu"
          aria-expanded={Boolean(songId)}
          active={Boolean(songId)}
          onClick={() => profile ? setSongId(songId ? null : track.songId ?? null) : openLogin()}
        >
          <SquarePlus size={19} strokeWidth={1.4} />
        </IconButton>
      </span>
      <Menu open={Boolean(songId)} anchor={anchor} items={items} onClose={() => setSongId(null)} align="end" />
      <CreatePlaylistDialog open={Boolean(creatingFor)} onClose={() => setCreatingFor(null)}
        onCreated={playlist => { if (creatingFor) void addToPlaylist(playlist.id, [creatingFor]); }} />
    </>
  );
}
