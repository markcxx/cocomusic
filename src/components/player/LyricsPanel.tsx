'use client';

import { animate } from 'framer-motion';
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
  const hoveringRef = useRef(false);
  const firstScroll = useRef(true);
  const glide = useRef<ReturnType<typeof animate> | null>(null);

  /**
   * Centre a line. Smooth moves use our own tween instead of `behavior: 'smooth'`:
   * the native one is cancelled by the next scrollTo, so a long return (after
   * hovering) would be cut short by the next line change and jump.
   */
  const center = useCallback((index: number, mode: 'instant' | 'line' | 'return') => {
    const box = container.current;
    const line = box?.querySelector<HTMLElement>(`[data-line="${Math.max(0, index)}"]`);
    if (!box || !line) return;
    const target = Math.max(0, Math.min(box.scrollHeight - box.clientHeight, line.offsetTop - box.clientHeight / 2 + line.offsetHeight / 2));
    glide.current?.stop();
    if (mode === 'instant' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { box.scrollTop = target; return; }
    // A return glide takes longer when it travels further (capped so it never drags).
    const distance = Math.abs(target - box.scrollTop);
    const duration = mode === 'return' ? Math.min(0.9, 0.45 + distance / 2400) : 0.5;
    glide.current = animate(box.scrollTop, target, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: value => { box.scrollTop = value; } });
  }, []);

  // Browsing: stop any glide so the user's own scroll is not fought.
  useEffect(() => {
    hoveringRef.current = hovering;
    if (hovering) glide.current?.stop();
  }, [hovering]);
  useEffect(() => () => glide.current?.stop(), []);

  // New song: start from the top without animation.
  useLayoutEffect(() => { firstScroll.current = true; }, [songId]);

  const wasHovering = useRef(false);
  useLayoutEffect(() => {
    const returning = wasHovering.current && !hovering;
    wasHovering.current = hovering;
    if (hovering || !synced || !lines.length) return;
    center(active, firstScroll.current ? 'instant' : returning ? 'return' : 'line');
    firstScroll.current = false;
  }, [active, hovering, synced, lines.length, center]);

  // Re-centre when the window (and so the column) is resized. The observer's
  // initial callback is skipped: it would otherwise snap over a running glide.
  const latestActive = useRef(active);
  useEffect(() => { latestActive.current = active; }, [active]);
  useEffect(() => {
    const box = container.current;
    if (!box) return;
    let initial = true;
    const observer = new ResizeObserver(() => {
      if (initial) { initial = false; return; }
      if (!hoveringRef.current) center(latestActive.current, 'instant');
    });
    observer.observe(box);
    return () => observer.disconnect();
    // lines.length: the column only mounts once lyrics have loaded.
  }, [center, lines.length]);

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
