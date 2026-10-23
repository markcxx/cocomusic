'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '@/components/ui';
import { catalogApi, useCatalog, type LyricLine } from '@/lib/catalog-client';
import { cn } from '@/lib/cn';
import { activeLineIndex } from '@/server/music/lrc';
import { formatTime, usePlaybackPosition, usePlayer } from './player-store';
import styles from './LyricsDrawer.module.css';

/** Lead so a line lights up as it starts, not a frame late (also hides decode latency). */
const LEAD_SECONDS = 0.25;

const LineList = memo(function LineList({ lines, active, synced, onSeek }: { lines: LyricLine[]; active: number; synced: boolean; onSeek: (time: number) => void }) {
  return (
    <>
      {lines.map((line, index) => (
        <p
          key={`${line.time}:${index}`}
          data-line={index}
          className={cn(styles.line, synced && index === active && styles.lineActive, synced && index < active && styles.linePast)}
          onClick={synced ? () => onSeek(line.time) : undefined}
          title={synced ? `跳转到 ${formatTime(line.time)}` : undefined}
        >
          <span className={styles.lineText}>{line.text}</span>
          {line.translation && <span className={styles.lineTranslation}>{line.translation}</span>}
        </p>
      ))}
    </>
  );
});

/**
 * Synced lyric column. The active line follows playback and is kept centred.
 * While the pointer is over the column, auto-scroll pauses so the user can browse
 * (and click a line to seek); on leave it glides back to the current line.
 */
export function LyricsPanel() {
  const { track, trial, seek } = usePlayer();
  const songId = track.songId;
  const lyrics = useCatalog(signal => (songId ? catalogApi.lyrics(songId, signal) : Promise.resolve(null)), `lyrics:${songId ?? ''}`);
  const position = usePlaybackPosition();
  const offset = trial?.start ?? 0;
  const lines = useMemo(() => lyrics.data?.lines ?? [], [lyrics.data]);
  const synced = Boolean(lyrics.data?.synced);
  const active = synced ? activeLineIndex(lines, position + offset + LEAD_SECONDS) : -1;

  const container = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);
  const firstScroll = useRef(true);

  const center = useCallback((index: number, smooth: boolean) => {
    const box = container.current;
    const line = box?.querySelector<HTMLElement>(`[data-line="${Math.max(0, index)}"]`);
    if (!box || !line) return;
    box.scrollTo({ top: line.offsetTop - box.clientHeight / 2 + line.offsetHeight / 2, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // New song: start from the top without animation.
  useLayoutEffect(() => { firstScroll.current = true; }, [songId]);

  useLayoutEffect(() => {
    if (hovering || !synced || !lines.length) return;
    center(active, !firstScroll.current);
    firstScroll.current = false;
  }, [active, hovering, synced, lines.length, center]);

  // Re-centre when the window (and so the column) is resized.
  const latestActive = useRef(active);
  useEffect(() => { latestActive.current = active; }, [active]);
  useEffect(() => {
    const box = container.current;
    if (!box) return;
    const observer = new ResizeObserver(() => { if (!hovering) center(latestActive.current, false); });
    observer.observe(box);
    return () => observer.disconnect();
    // lines.length: the column only mounts once lyrics have loaded.
  }, [hovering, center, lines.length]);

  // Lyric times are song-relative; a preview stream starts at trial.start.
  const onSeek = useCallback((time: number) => seek(Math.max(0, time - offset)), [seek, offset]);

  if (!songId) return <div className={styles.status}>选择一首歌曲开始播放</div>;
  if (lyrics.loading) return <div className={styles.status}><Spinner size={18} />正在加载歌词</div>;
  if (lyrics.error) return <div className={styles.status}>歌词加载失败<button type="button" className={styles.retry} onClick={lyrics.retry}>重试</button></div>;
  if (lyrics.data?.instrumental) return <div className={styles.status}>纯音乐，请欣赏</div>;
  if (!lines.length) return <div className={styles.status}>暂无歌词</div>;

  return (
    <div
      ref={container}
      className={cn(styles.lines, hovering && styles.browsing, !synced && styles.unsynced)}
      // Own scroller: wheel browses lyrics, and chains to the page (comments) at either end.
      data-scroll-native
      onPointerEnter={event => { if (event.pointerType === 'mouse') setHovering(true); }}
      onPointerLeave={() => setHovering(false)}
      aria-label="歌词"
    >
      <LineList lines={lines} active={active} synced={synced} onSeek={onSeek} />
    </div>
  );
}
