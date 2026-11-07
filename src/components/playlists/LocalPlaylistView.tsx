'use client';

import { Download, ExternalLink, ListMusic, PencilLine, Play, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { HeroDim, CollectionHero, formatDate } from '@/components/collection/CollectionHeader';
import { CollectionToolbar, useTrackFilter } from '@/components/collection/CollectionToolbar';
import { EmptyState } from '@/components/common/AsyncState';
import { downloads } from '@/components/downloads/download-store';
import { useNavigation } from '@/components/layout/navigation';
import { SelectionBar } from '@/components/music/SelectionBar';
import { SongTable } from '@/components/music/SongTable';
import { usePlayer } from '@/components/player/player-store';
import { Page } from '@/components/scroll';
import { Button, toast } from '@/components/ui';
import { localPlaylistCover, localPlaylists, useLocalPlaylist } from '@/lib/local-playlists';
import { catalogTracks } from '@/lib/to-track';
import { SOURCE_NAMES, SOURCE_TAGS } from '@/server/music/ids';
import type { Track } from '@/types/music';
import { DeleteLocalPlaylistDialog, RenameLocalPlaylistDialog } from './LocalPlaylistDialogs';

/** "网易云 12 · QQ 3 · 本地 2": where the songs of a mixed playlist come from. */
function sourceBreakdown(tracks: Track[]) {
  const counts = new Map<string, number>();
  for (const track of tracks) {
    const tag = track.localId || !track.source ? '本地' : SOURCE_TAGS[track.source];
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts].map(([tag, count]) => `${tag} ${count}`).join(' · ');
}

/**
 * 本地歌单 detail: same hero, toolbar and song table as platform playlists.
 * Songs of every platform and local files play side by side; nothing needs a login.
 */
export function LocalPlaylistView({ id, title }: { id: string; title?: string }) {
  const player = usePlayer();
  const { navigate } = useNavigation();
  const playlist = useLocalPlaylist(id);
  const tracks = useMemo(() => playlist?.tracks ?? [], [playlist]);
  const { filter, setFilter, filtering, visible, selection, selectedTracks } = useTrackFilter(tracks);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const downloadable = useMemo(() => catalogTracks(tracks), [tracks]);

  if (!playlist) {
    return <Page><EmptyState icon={<ListMusic size={32} strokeWidth={1.2} />} message="这个本地歌单不存在或已被删除" /></Page>;
  }

  const play = (start?: Track) => {
    const queue = filtering ? visible : tracks;
    const first = start ?? queue[0];
    if (first) player.play(first, queue);
  };
  const ref = { kind: 'local' as const, id };
  const origin = playlist.origin;

  return (
    <Page gap="sm">
      <CollectionHero
        ready
        seed={`local-playlist:${id}`}
        cover={localPlaylistCover(playlist)}
        eyebrow={['本地歌单', origin ? `导入自${SOURCE_NAMES[origin.source]}` : ''].filter(Boolean).join(' · ')}
        title={playlist.name ?? title}
        owner={(
          <>
            <HeroDim>{formatDate(playlist.createdAt)} 创建</HeroDim>
            {playlist.updatedAt - playlist.createdAt > 60_000 && <HeroDim>{formatDate(playlist.updatedAt)} 更新</HeroDim>}
          </>
        )}
        stats={(
          <>
            <span>{tracks.length} 首</span>
            {tracks.length > 0 && <span>{sourceBreakdown(tracks)}</span>}
          </>
        )}
        description={playlist.description}
        actions={(
          <>
            <Button variant="primary" icon={<Play size={16} strokeWidth={0} fill="currentColor" />} onClick={() => play()} disabled={!tracks.length}>播放全部</Button>
            <Button icon={<Download size={16} strokeWidth={1.5} />} disabled={!downloadable.length} onClick={() => void downloads.add(downloadable)} title="下载歌单中的平台歌曲（本地文件无需下载）">下载</Button>
            {origin && (
              <Button icon={<ExternalLink size={16} strokeWidth={1.5} />} onClick={() => navigate({ name: origin.kind, id: origin.id, source: origin.source, title: playlist.name })} title="打开导入时的平台歌单">原歌单</Button>
            )}
            <Button icon={<PencilLine size={16} strokeWidth={1.5} />} onClick={() => setRenaming(true)}>重命名</Button>
            <Button icon={<Trash2 size={16} strokeWidth={1.5} />} onClick={() => setDeleting(true)}>删除</Button>
          </>
        )}
      />
      <CollectionToolbar
        title={playlist.name}
        total={tracks.length}
        filter={filter}
        onFilter={setFilter}
        visibleCount={visible.length}
        selection={selection}
        onPlayAll={() => play()}
      />
      <SongTable
        tracks={visible}
        showSource
        selection={selection}
        playlist={ref}
        onPlayTrack={(track, mode) => (mode === 'list' ? player.playFromList(track, filtering ? visible : tracks) : play(track))}
        emptyText={filtering ? '没有匹配的歌曲' : '歌单还是空的：在歌曲的「更多」菜单里选「添加到歌单」，或在播放列表里保存当前队列'}
      />
      <SelectionBar
        selection={selection}
        selectedTracks={selectedTracks}
        playlist={ref}
        onPlay={() => { const picked = selectedTracks(); if (picked[0]) player.play(picked[0], picked); selection.exit(); }}
        onQueue={() => { player.enqueue(selectedTracks()); selection.exit(); }}
        onDownload={() => { void downloads.add(catalogTracks(selectedTracks())); selection.exit(); }}
        onRemove={() => {
          const picked = selectedTracks();
          try {
            localPlaylists.removeTracks(id, picked.map(track => track.id));
            toast.success(`已移除 ${picked.length} 首`);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : '移除失败');
          }
          selection.exit();
        }}
      />
      <RenameLocalPlaylistDialog playlist={renaming ? playlist : null} onClose={() => setRenaming(false)} />
      <DeleteLocalPlaylistDialog playlist={deleting ? playlist : null} onClose={() => setDeleting(false)} onDeleted={() => navigate({ name: 'home' })} />
    </Page>
  );
}
