'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRightToLine, Heart, Loader2, MessageCircleMore, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LikeButton } from '@/components/account/LikeButton';
import { BadgedIcon } from '@/components/common/BadgedIcon';
import { IconButton, Slider } from '@/components/ui';
import { cn } from '@/lib/cn';
import { playModeLabels, playModes, usePlayer, type PlayMode } from './player-store';
import styles from './controls.module.css';

/**
 * Playback controls shared by the main player bar and the lyrics page bar.
 * Colours come from the surrounding theme (`currentColor` + CSS variables),
 * so the same controls render on the light bar and the dark lyrics page.
 */

/** Cross-rotating swap between two icons (play/pause, play modes). */
const swap = {
  initial: { opacity: 0, scale: 0.5, rotate: -45 },
  animate: { opacity: 1, scale: 1, rotate: 0 },
  exit: { opacity: 0, scale: 0.5, rotate: 45 },
  transition: { type: 'spring' as const, stiffness: 500, damping: 28 },
};

export function Swap({ id, children }: { id: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span key={id} className={styles.iconWrap} {...swap}>{children}</motion.span>
    </AnimatePresence>
  );
}

const modeIcons: Record<PlayMode, typeof Repeat> = { loop: Repeat, shuffle: Shuffle, one: Repeat1, order: ArrowRightToLine };

/** One button cycling 列表循环 → 随机播放 → 单曲循环 → 顺序播放. The tooltip names the next mode. */
export function PlayModeButton({ size = 18 }: { size?: number }) {
  const { mode, cycleMode } = usePlayer();
  const Icon = modeIcons[mode];
  const next = playModes[(playModes.indexOf(mode) + 1) % playModes.length];
  return (
    // The icon itself shows the mode; no `active` fill (it read as a stuck hover background).
    <IconButton label={playModeLabels[mode]} tooltip={`${playModeLabels[mode]} · 点击切换为${playModeLabels[next]}`} onClick={cycleMode} tone="muted">
      <Swap id={mode}><Icon size={size} strokeWidth={1.4} /></Swap>
    </IconButton>
  );
}

export function PlayPauseButton({ large = false }: { large?: boolean }) {
  const player = usePlayer();
  const buffering = player.playing && player.status === 'loading';
  return <PlaybackButton playing={player.playing} buffering={buffering} onToggle={player.togglePlay} large={large} />;
}

/** Shared audio/video play control with the same size, icon transition and focus behaviour. */
export function PlaybackButton({ playing, buffering = false, onToggle, large = false, compact = false }: { playing: boolean; buffering?: boolean; onToggle: () => void; large?: boolean; compact?: boolean }) {
  const label = playing ? '暂停' : '播放';
  const glyph = large ? 22 : compact ? 15 : 18;
  return (
    <motion.button
      type="button"
      className={cn(styles.playButton, large && styles.playLarge, compact && styles.playCompact, playing && styles.playing)}
      onClick={onToggle}
      aria-label={label}
      data-tooltip={label}
      data-tooltip-shortcut="Space"
      whileHover={{ scale: 1.07 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 520, damping: 20 }}
    >
      <Swap id={buffering ? 'loading' : playing ? 'pause' : 'play'}>
        {buffering
          ? <Loader2 size={glyph} strokeWidth={2} className={styles.spin} aria-label="缓冲中" />
          : playing ? <Pause size={glyph} strokeWidth={0} fill="currentColor" /> : <Play size={glyph} strokeWidth={0} fill="currentColor" className={styles.playGlyph} />}
      </Swap>
    </motion.button>
  );
}

/** 上一首 / 下一首, shared by the main bar and the lyrics page bar so both look the same. */
export function SkipButton({ direction, size = 20 }: { direction: 'previous' | 'next'; size?: number }) {
  const player = usePlayer();
  const back = direction === 'previous';
  const Icon = back ? SkipBack : SkipForward;
  return (
    <IconButton label={back ? '上一首' : '下一首'} onClick={back ? player.previous : player.next} iconHover={{ x: back ? -2 : 2, scale: 1.1 }} disabled={!player.queue.length}>
      <Icon size={size} strokeWidth={1.4} />
    </IconButton>
  );
}

/** Like · previous · play · next · mode. */
export function Transport({ likeCount, large = false }: { likeCount?: number; large?: boolean }) {
  const { track } = usePlayer();
  const skip = large ? 22 : 20;
  return (
    <div className={cn(styles.buttons, large && styles.buttonsLarge)}>
      {track.songId
        ? <LikeButton songId={track.songId} source={track.source} size="md" iconSize={18} count={likeCount} />
        : <IconButton label="喜欢" disabled><Heart size={18} strokeWidth={1.4} /></IconButton>}
      <SkipButton direction="previous" size={skip} />
      <PlayPauseButton large={large} />
      <SkipButton direction="next" size={skip} />
      <PlayModeButton />
    </div>
  );
}

/** Speech-bubble button with the comment total embedded in its corner. */
export function CommentButton({ count, onClick, active, disabled }: { count?: number; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <IconButton
      label="评论"
      tooltip={count ? `评论 · ${count.toLocaleString('zh-CN')} 条` : '评论'}
      onClick={onClick}
      disabled={disabled}
      active={active}
      tone="muted"
      className={count ? styles.badged : undefined}
    >
      <BadgedIcon count={count}><MessageCircleMore size={18} strokeWidth={1.4} /></BadgedIcon>
    </IconButton>
  );
}

/**
 * Volume: the speaker icon (click = mute) opens a vertical slider on hover,
 * above the button. The popover stays while the pointer is over either part,
 * while dragging, or while the slider has keyboard focus. Wheel over the
 * icon or the popover nudges the volume.
 */
export function VolumeControl({ className, controls }: { className?: string; controls?: { volume: number; setVolume: (value: number) => void; toggleMute: () => void } }) {
  const audio = usePlayer();
  const player = controls ?? audio;
  const VolumeIcon = player.volume === 0 ? VolumeX : player.volume < 0.5 ? Volume1 : Volume2;
  const [open, setOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);
  const percent = Math.round(player.volume * 100);

  const show = () => { clearTimeout(hideTimer.current); setOpen(true); };
  // A short grace period lets the pointer travel from the icon up to the popover.
  const hide = () => { clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setOpen(false), 220); };
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  // Native, non-passive wheel listener so the page does not scroll while adjusting.
  const latestVolume = useRef(player.volume);
  useEffect(() => { latestVolume.current = player.volume; }, [player.volume]);
  const setVolume = player.setVolume;
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const step = event.deltaY < 0 ? 0.05 : -0.05;
      setVolume(Math.min(1, Math.max(0, Math.round((latestVolume.current + step) * 100) / 100)));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [setVolume]);

  return (
    <div
      ref={root}
      className={cn(styles.volume, className)}
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) hide(); }}
    >
      <IconButton label={player.volume > 0 ? '静音' : '取消静音'} tooltip={open ? false : `音量 ${percent}%`} onClick={player.toggleMute} tone="muted" active={open}>
        <VolumeIcon size={19} strokeWidth={1.4} />
      </IconButton>
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.volumePopover}
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          >
            <span className={styles.volumeValue}>{percent}</span>
            <div className={styles.volumeTrack}>
              <Slider orientation="vertical" size="sm" value={percent} max={100} step={1} onChange={value => player.setVolume(value / 100)} label="音量" formatValue={value => `${Math.round(value)}%`} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
