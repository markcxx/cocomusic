'use client';

import { HardDrive, ListPlus, LogIn, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useAccount } from '@/components/account/account-store';
import { CreatePlaylistDialog } from '@/components/account/CreatePlaylistDialog';
import { toast, type MenuItem } from '@/components/ui';
import { localPlaylists, useLocalPlaylists } from '@/lib/local-playlists';
import type { LocalPlaylistSummary } from '@/lib/me-client';
import { useSettings } from '@/lib/settings';
import { SOURCE_NAMES } from '@/server/music/ids';
import type { Track } from '@/types/music';
import { CreateLocalPlaylistDialog, type LocalPlaylistDraft } from './LocalPlaylistDialogs';

/** A playlist the user can edit: one of the account's own, or a 本地歌单. */
export type PlaylistRef = { kind: 'platform' | 'local'; id: string };

const icon = (Icon: typeof ListPlus) => <Icon size={15} strokeWidth={1.5} />;

/** Add songs to a 本地歌单, reporting how many were new. */
export async function addToLocalPlaylist(playlist: LocalPlaylistSummary, tracks: Track[]) {
  try {
    const added = await localPlaylists.addTracks(playlist.id, tracks);
    if (added) toast.success(`已添加 ${added} 首到「${playlist.name}」`);
    else toast.info(`歌曲已在「${playlist.name}」中`);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '添加失败');
  }
}

/**
 * "添加到歌单" for a row menu or the batch bar. 本地歌单 take any song (every
 * platform, local files); the account's own playlists take only songs of the
 * selected platform, since that is the account signed in. `dialogs` must be
 * rendered by the caller (新建歌单 opens one).
 */
export function useAddToPlaylist(): { items: (tracks: Track[], options?: { exclude?: PlaylistRef; onDone?: () => void }) => MenuItem[]; dialogs: ReactNode } {
  const { profile, playlists, addToPlaylist, openLogin } = useAccount();
  const local = useLocalPlaylists() ?? [];
  const platform = useSettings().catalogSource;
  const [localDraft, setLocalDraft] = useState<LocalPlaylistDraft>(null);
  const [platformDraft, setPlatformDraft] = useState<string[] | null>(null);

  const items = (tracks: Track[], { exclude, onDone }: { exclude?: PlaylistRef; onDone?: () => void } = {}): MenuItem[] => {
    const then = (action: () => void) => () => { action(); onDone?.(); };
    // Platform playlists need every song to be a catalog song of the signed-in platform.
    const platformIds = tracks.every(track => track.songId && !track.localId && track.source === platform) ? tracks.map(track => track.songId!) : [];
    const own = playlists.filter(item => item.own && !(exclude?.kind === 'platform' && exclude.id === item.id));
    const platformSection: MenuItem[] = !platformIds.length ? [] : [
      { type: 'divider' },
      { type: 'section', label: `${SOURCE_NAMES[platform]}歌单` },
      ...(profile
        ? [
            { label: '新建歌单…', icon: icon(Plus), onSelect: then(() => setPlatformDraft(platformIds)) },
            ...own.map((item): MenuItem => ({
              label: item.liked ? '我喜欢的音乐' : item.name,
              icon: icon(ListPlus),
              hint: item.trackCount !== undefined ? `${item.trackCount}` : undefined,
              onSelect: then(() => void addToPlaylist(item.id, platformIds)),
            })),
          ]
        : [{ label: '登录后添加到平台歌单', icon: icon(LogIn), onSelect: then(openLogin) }]),
    ];
    return [
      { type: 'section', label: '本地歌单' },
      { label: '新建本地歌单…', icon: icon(Plus), onSelect: then(() => setLocalDraft({ tracks })) },
      ...local
        .filter(item => !(exclude?.kind === 'local' && exclude.id === item.id))
        .map((item): MenuItem => ({ label: item.name, icon: icon(HardDrive), hint: `${item.trackCount}`, onSelect: then(() => void addToLocalPlaylist(item, tracks)) })),
      ...platformSection,
    ];
  };

  const dialogs = (
    <>
      <CreateLocalPlaylistDialog draft={localDraft} onClose={() => setLocalDraft(null)} />
      <CreatePlaylistDialog
        open={Boolean(platformDraft)}
        onClose={() => setPlatformDraft(null)}
        onCreated={playlist => { if (platformDraft) void addToPlaylist(playlist.id, platformDraft); }}
      />
    </>
  );
  return { items, dialogs };
}
