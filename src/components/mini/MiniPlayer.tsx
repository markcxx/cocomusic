'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Maximize2, PanelRightClose, Pause, PinOff, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { LikeButton } from '@/components/account/LikeButton';
import { Cover } from '@/components/common/Cover';
import { PlayModeButton } from '@/components/player/controls';
import { usePlaybackPosition, usePlayer } from '@/components/player/player-store';
import { useTrackLyrics } from '@/components/player/use-track-lyrics';
import { IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useSettings } from '@/lib/settings';
import { activeLineIndex } from '@/server/music/lrc';
import { isPlayable } from '@/types/music';
import { exitMini } from './use-mini-mode';
import styles from './MiniPlayer.module.css';

const RING = 2 * Math.PI * 21;
const EAR_RING = 2 * Math.PI * 31;

type DockSide = 'left' | 'right' | null;

/** Current lyric line (song title when unsynced), swapped with a vertical slide. */
function LyricTicker() {
  const { track, trial } = usePlayer();
  const position = usePlaybackPosition();
  const lyrics = useTrackLyrics(track);
  const lines = useMemo(() => lyrics.data?.lines ?? [], [lyrics.data]);
  const prefs = useSettings();
  const index = prefs.miniShowLyrics && lyrics.data?.synced ? activeLineIndex(lines, position + (trial?.start ?? 0) + 0.25 + prefs.lyricsOffset) : -1;
  const line = index >= 0 ? lines[index] : undefined;
  const text = line?.text || track.artist || '选一首歌，开始聆听';
  return (
    <span className={styles.ticker} aria-live="off">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={`${index}:${text}`}
          className={cn(styles.tickerLine, line && styles.tickerLyric)}
          initial={{ y: 14, opacity: 0, filter: 'blur(3px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          exit={{ y: -14, opacity: 0, filter: 'blur(3px)' }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Play button wrapped in a ring that fills with playback progress. */
function RingPlay() {
  const player = usePlayer();
  const position = usePlaybackPosition();
  const ratio = player.duration > 0 ? Math.min(1, position / player.duration) : 0;
  const buffering = player.playing && player.status === 'loading';
  const label = player.playing ? '暂停' : '播放';
  return (
    <motion.button type="button" className={styles.ringPlay} onClick={player.togglePlay} aria-label={label} data-tooltip={label} data-tooltip-shortcut="Space" whileTap={{ scale: 0.9 }}>
      <svg viewBox="0 0 48 48" className={styles.ring} aria-hidden>
        <circle cx="24" cy="24" r="21" className={styles.ringTrack} />
        <circle cx="24" cy="24" r="21" className={styles.ringFill} strokeDasharray={RING} strokeDashoffset={RING * (1 - ratio)} />
      </svg>
      <span className={styles.ringGlyph}>
        {buffering ? <Loader2 size={16} className={styles.spin} /> : player.playing ? <Pause size={16} strokeWidth={0} fill="currentColor" /> : <Play size={16} strokeWidth={0} fill="currentColor" style={{ marginLeft: 2 }} />}
      </span>
    </motion.button>
  );
}

/**
 * Edge-docked "Vinyl Ear": half-peeking spinning vinyl disc + progress arc
 * tucked flush against the screen's left or right edge. Hovering expands the
 * full mini player; clicking toggles play/pause.
 */
function VinylEar({ side, onPeek }: { side: 'left' | 'right'; onPeek: () => void }) {
  const player = usePlayer();
  const position = usePlaybackPosition();
  const miniSpin = useSettings().miniSpinRecord;
  const empty = !isPlayable(player.track);
  const ratio = player.duration > 0 ? Math.min(1, position / player.duration) : 0;

  return (
    <div
      className={cn(styles.earShell, side === 'left' ? styles.earLeft : styles.earRight)}
      data-theme="dark"
      onPointerEnter={onPeek}
      onClick={player.togglePlay}
      role="button"
      tabIndex={0}
      aria-label={`迷你黑胶耳：${empty ? '未在播放' : player.track.title}（移入展开）`}
    >
      <div className={styles.backdrop} aria-hidden>
        {!empty && <Cover seed={player.track.coverSeed} src={player.track.cover} className={styles.backdropCover} />}
      </div>

      <div className={styles.earDiscWrap}>
        <svg viewBox="0 0 68 68" className={styles.earArc} aria-hidden>
          <circle cx="34" cy="34" r="31" className={styles.earArcTrack} />
          <circle cx="34" cy="34" r="31" className={styles.earArcFill} strokeDasharray={EAR_RING} strokeDashoffset={EAR_RING * (1 - ratio)} />
        </svg>
        <span className={cn(styles.disc, styles.earDisc, player.playing && miniSpin && styles.spinning)}>
          <Cover seed={player.track.coverSeed} src={player.track.cover} radius={999} className={styles.discCover} empty={empty} />
        </span>
      </div>
    </div>
  );
}

/**
 * Mini mode: the whole window becomes a floating capsule. Dragging to the left
 * or right screen edge (or clicking the dock button) tucks it into a magnetic
 * "vinyl ear" that expands smoothly when hovered.
 */
export function MiniPlayer() {
  const player = usePlayer();
  const { track } = player;
  const empty = !isPlayable(track);
  const { miniSpinRecord: miniSpin, miniEdgeDock } = useSettings();

  const [rawDock, setDock] = useState<{ side: DockSide; expanded: boolean }>({ side: null, expanded: true });
  const dock = miniEdgeDock ? rawDock : { side: null as DockSide, expanded: true };
  // Web preview (`?mini`) drag & edge-dock simulation so browser previews behave just like desktop.
  const [webPos, setWebPos] = useState<{ x: number; y: number } | null>(null);
  const webDrag = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const webCollapseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isWeb = typeof window !== 'undefined' && !window.coco;

  useEffect(() => {
    window.coco?.window.miniDock?.(miniEdgeDock ? 'enable' : 'disable');
  }, [miniEdgeDock]);

  useEffect(() => {
    const off = window.coco?.window.onMiniDockChange?.(setDock);
    return () => { off?.(); clearTimeout(webCollapseTimer.current); };
  }, []);

  const requestPeek = () => {
    clearTimeout(webCollapseTimer.current);
    if (window.coco) {
      window.coco.window.miniDock?.('peek');
    } else if (dock.side) {
      setDock(prev => ({ ...prev, expanded: true }));
    }
  };

  const dockNearest = () => {
    if (window.coco) {
      window.coco.window.miniDock?.('dock-nearest');
      return;
    }
    const vw = window.innerWidth;
    const x = webPos?.x ?? 12;
    const side: 'left' | 'right' = x + 220 < vw / 2 ? 'left' : 'right';
    setWebPos({ x: side === 'left' ? 0 : vw - 440, y: webPos?.y ?? 24 });
    setDock({ side, expanded: false });
  };

  const undock = () => {
    if (window.coco) {
      window.coco.window.miniDock?.('undock');
      return;
    }
    const vw = window.innerWidth;
    setWebPos(prev => ({
      x: dock.side === 'right' ? Math.max(12, vw - 464) : 24,
      y: prev?.y ?? 24,
    }));
    setDock({ side: null, expanded: true });
  };

  // Web-only pointer drag for `?mini` preview mode.
  const onWebPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!isWeb || event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    webDrag.current = { startX: event.clientX, startY: event.clientY, origX: rect.left, origY: rect.top };
  };

  const onWebPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!webDrag.current) return;
    const x = Math.max(0, Math.min(window.innerWidth - 440, webDrag.current.origX + (event.clientX - webDrag.current.startX)));
    const y = Math.max(8, Math.min(window.innerHeight - 104, webDrag.current.origY + (event.clientY - webDrag.current.startY)));
    setWebPos({ x, y });
  };

  const onWebPointerUp = () => {
    if (!webDrag.current) return;
    webDrag.current = null;
    if (!miniEdgeDock || !webPos) return;
    const vw = window.innerWidth;
    if (webPos.x <= 28) {
      setWebPos({ x: 0, y: webPos.y });
      setDock({ side: 'left', expanded: true });
    } else if (vw - (webPos.x + 440) <= 28) {
      setWebPos({ x: vw - 440, y: webPos.y });
      setDock({ side: 'right', expanded: true });
    } else if (dock.side) {
      setDock({ side: null, expanded: true });
    }
  };

  if (miniEdgeDock && dock.side && !dock.expanded) {
    return (
      <div
        style={isWeb && webPos ? {
          position: 'fixed',
          top: webPos.y,
          left: dock.side === 'left' ? 0 : undefined,
          right: dock.side === 'right' ? 0 : undefined,
          width: 76,
          height: 88,
          zIndex: 400,
        } : undefined}
      >
        <VinylEar side={dock.side} onPeek={requestPeek} />
      </div>
    );
  }

  const webStyle: CSSProperties | undefined = isWeb && webPos
    ? { left: dock.side === 'left' ? 0 : dock.side === 'right' ? window.innerWidth - 440 : webPos.x, top: webPos.y }
    : undefined;

  return (
    <div
      className={cn(styles.shell, dock.side === 'left' && styles.dockedLeft, dock.side === 'right' && styles.dockedRight)}
      style={webStyle}
      data-theme="dark"
      onPointerDown={onWebPointerDown}
      onPointerMove={onWebPointerMove}
      onPointerUp={onWebPointerUp}
      onPointerCancel={onWebPointerUp}
      onPointerEnter={() => clearTimeout(webCollapseTimer.current)}
      onPointerLeave={() => {
        if (isWeb && miniEdgeDock && dock.side && !webDrag.current) {
          webCollapseTimer.current = setTimeout(() => setDock(prev => (prev.side ? { ...prev, expanded: false } : prev)), 360);
        }
      }}
    >
      <div className={styles.backdrop} aria-hidden>
        {!empty && <Cover seed={track.coverSeed} src={track.cover} className={styles.backdropCover} />}
      </div>

      <button type="button" className={styles.record} onClick={exitMini} aria-label="返回完整窗口" data-tooltip="返回完整窗口">
        <span className={cn(styles.disc, player.playing && miniSpin && styles.spinning)}>
          <Cover seed={track.coverSeed} src={track.cover} radius={999} className={styles.discCover} empty={empty} />
        </span>
        <span className={styles.recordHint}><Maximize2 size={14} strokeWidth={1.8} /></span>
      </button>

      <div className={styles.meta}>
        <strong data-tooltip={empty ? undefined : `${track.title} - ${track.artist}`} data-tooltip-overflow>{empty ? '未在播放' : track.title}</strong>
        <LyricTicker />
      </div>

      <div className={styles.controls}>
        <span className={styles.secondary}>
          {track.songId && <LikeButton songId={track.songId} title={track.title} source={track.source} size="sm" iconSize={15} />}
        </span>
        <IconButton label="上一首" size="sm" onClick={player.previous} disabled={!player.queue.length}><SkipBack size={16} strokeWidth={1.5} /></IconButton>
        <RingPlay />
        <IconButton label="下一首" size="sm" onClick={player.next} disabled={!player.queue.length}><SkipForward size={16} strokeWidth={1.5} /></IconButton>
        <span className={styles.secondary}><PlayModeButton size={15} /></span>
      </div>

      <div className={styles.windowButtons}>
        {miniEdgeDock && (
          dock.side ? (
            <IconButton label="解除贴边吸附" tooltip="解除贴边磁吸" size="sm" onClick={undock}>
              <PinOff size={13} strokeWidth={1.6} />
            </IconButton>
          ) : (
            <IconButton label="贴边收起为黑胶耳" tooltip="贴边收起为黑胶耳" size="sm" onClick={dockNearest}>
              <PanelRightClose size={13} strokeWidth={1.6} />
            </IconButton>
          )
        )}
        <IconButton label="返回完整窗口" size="sm" onClick={exitMini}><Maximize2 size={13} strokeWidth={1.6} /></IconButton>
        <IconButton label="关闭" size="sm" onClick={() => window.coco?.window.close()}><X size={14} strokeWidth={1.6} /></IconButton>
      </div>
    </div>
  );
}
