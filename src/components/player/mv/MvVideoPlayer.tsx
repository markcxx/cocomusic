'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Maximize, Minimize, PictureInPicture2, Play, RotateCcw } from 'lucide-react';
import 'video.js/dist/video-js.css';
import { IconButton, Slider } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PlaybackButton, VolumeControl } from '../controls';
import { formatTime } from '../player-store';
import type { MusicVideo } from '@/server/music/mv';
import { MvMenu } from './MvMenu';
import { useVideoPlayer } from './use-video-player';
import styles from './MvVideoPlayer.module.css';

const RATES = [0.75, 1, 1.25, 1.5, 2];
/** Controls fade out after this long without pointer movement while the video plays. */
const IDLE_MS = 2600;

/**
 * 16:9 video stage with the app's own controls floating over the picture
 * (dark player theme, same play button / slider / volume as the music bar).
 * Click toggles playback, double-click toggles fullscreen.
 */
export function MvVideoPlayer({ mv, quality, onQuality, onError, children }: {
  mv: MusicVideo; quality: string; onQuality: (value: string) => void;
  onError: (message: string) => void; children?: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { host, state, toggle, seek, setVolume, toggleMute, setRate, pictureInPicture } = useVideoPlayer(mv, quality, onError);
  const [fullscreenElement, setFullscreenElement] = useState<HTMLElement | null>(null);
  const fullscreen = Boolean(fullscreenElement);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const sync = () => setFullscreenElement(document.fullscreenElement === root.current ? root.current : null);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const wake = () => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  };
  useEffect(() => () => clearTimeout(idleTimer.current), []);
  // Paused, buffering or showing a status: keep the controls in view.
  const hideChrome = idle && state.playing && !children;
  const toggleFullscreen = () => {
    if (fullscreen) void document.exitFullscreen().catch(() => {});
    else void root.current?.requestFullscreen().catch(() => {});
  };

  return (
    <div
      ref={root}
      className={cn(styles.player, hideChrome && styles.idle)}
      data-player-surface
      tabIndex={0}
      aria-label="MV 视频"
      onPointerMove={wake}
      onPointerLeave={() => { clearTimeout(idleTimer.current); setIdle(true); }}
      onKeyDown={event => {
        wake();
        if (event.target !== event.currentTarget) return;
        if (event.code === 'Space') { event.preventDefault(); event.stopPropagation(); toggle(); }
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); seek(state.time + (event.key === 'ArrowRight' ? 5 : -5)); }
        if (event.key === 'f') toggleFullscreen();
      }}
    >
      <div ref={host} className={styles.host} onClick={toggle} onDoubleClick={toggleFullscreen} />

      <AnimatePresence>
        {!state.playing && !state.buffering && !children && (
          <motion.button
            type="button"
            className={styles.bigPlay}
            aria-label={state.ended ? '重新播放' : '播放'}
            onClick={toggle}
            initial={{ opacity: 0, scale: 0.86 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.08 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          >
            {state.ended ? <RotateCcw size={20} strokeWidth={1.8} /> : <Play size={20} strokeWidth={0} fill="currentColor" />}
          </motion.button>
        )}
      </AnimatePresence>

      {children}

      <div className={styles.chrome} data-theme="dark">
        <Slider value={state.time} max={state.duration} onCommit={seek} label="MV 播放进度" formatValue={formatTime} step={1} size="sm" />
        <div className={styles.controlRow}>
          <PlaybackButton compact playing={state.playing} buffering={state.playing && state.buffering} onToggle={toggle} />
          <span className={styles.time}>{formatTime(state.time)}<span> / {formatTime(state.duration)}</span></span>
          <div className={styles.tools}>
            <MvMenu label="清晰度" value={quality} options={mv.qualities.map(q => ({ value: q.id, label: q.label }))} onChange={onQuality} portalContainer={fullscreenElement} />
            <MvMenu label="播放速度" value={String(state.rate)} options={RATES.map(rate => ({ value: String(rate), label: rate === 1 ? '倍速' : `${rate}×` }))} onChange={value => setRate(Number(value))} portalContainer={fullscreenElement} />
            <VolumeControl controls={{ volume: state.muted ? 0 : state.volume, setVolume, toggleMute }} />
            <IconButton label="画中画" disabled={!state.pip} onClick={pictureInPicture}><PictureInPicture2 size={18} strokeWidth={1.5} /></IconButton>
            <IconButton label={fullscreen ? '退出全屏' : '全屏'} shortcut="F" onClick={toggleFullscreen}>
              {fullscreen ? <Minimize size={18} strokeWidth={1.5} /> : <Maximize size={18} strokeWidth={1.5} />}
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  );
}
