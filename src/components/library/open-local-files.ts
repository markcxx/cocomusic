'use client';

import { useEffect, useState } from 'react';
import { usePlayer } from '@/components/player/player-store';
import { toast } from '@/components/ui/toast';
import { localApi, localToTrack } from '@/lib/local-client';
import { useLatest } from '@/lib/use-latest';

/** Listeners for library changes (pages refetch when files are added from anywhere). */
const changed = new Set<() => void>();
export const libraryEvents = {
  emit: () => changed.forEach(listener => listener()),
  on(listener: () => void) { changed.add(listener); return () => { changed.delete(listener); }; },
};

/** Index the files, then play the first and queue the rest right after it. */
export async function playLocalFiles(files: string[], player: ReturnType<typeof usePlayer>) {
  if (!files.length) return;
  try {
    const { tracks } = await localApi.open(files);
    if (!tracks.length) { toast.error('没有可以播放的音频文件'); return; }
    const queue = tracks.map(localToTrack);
    player.playNext(queue);
    player.play(queue[0]);
    libraryEvents.emit();
    if (queue.length > 1) toast.success(`已加入 ${queue.length} 首本地歌曲`);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '无法打开文件');
  }
}

/**
 * App-wide entry for local files:
 * - files opened with CoCo Music from Finder / Explorer ("打开方式", double-click),
 * - audio dropped anywhere on the window.
 * Returns whether a drag with files is over the window (for the drop overlay).
 */
export function useOpenLocalFiles() {
  const player = usePlayer();
  const latest = useLatest(player);
  const [dragging, setDragging] = useState(false);

  useEffect(() => window.coco?.files?.onOpen(files => void playLocalFiles(files, latest.current)), [latest]);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
    const onEnter = (event: DragEvent) => { if (!hasFiles(event)) return; depth += 1; setDragging(true); };
    const onLeave = (event: DragEvent) => { if (!hasFiles(event)) return; depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const onOver = (event: DragEvent) => { if (hasFiles(event)) event.preventDefault(); };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const bridge = window.coco?.files;
      if (!bridge) { toast.info('拖入本地文件需要在桌面客户端中使用'); return; }
      const files = Array.from(event.dataTransfer?.files ?? []).map(file => bridge.pathForFile(file)).filter((file): file is string => Boolean(file));
      void playLocalFiles(files, latest.current);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [latest]);

  return dragging;
}
