'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRightToLine, Heart, Loader2, MessageCircleMore, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react';
import type { ReactNode } from 'react';
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
    <IconButton label={playModeLabels[mode]} tooltip={`${playModeLabels[mode]} · 点击切换为${playModeLabels[next]}`} onClick={cycleMode} active={mode !== 'loop'} tone="muted">
      <Swap id={mode}><Icon size={size} strokeWidth={1.4} /></Swap>
    </IconButton>
  );
}

export function PlayPauseButton({ large = false }: { large?: boolean }) {
  const player = usePlayer();
  const buffering = player.playing && player.status === 'loading';
  const label = player.playing ? '暂停' : '播放';
  const glyph = large ? 22 : 18;
  return (
    <motion.button
      type="button"
      className={cn(styles.playButton, large && styles.playLarge, player.playing && styles.playing)}
      onClick={player.togglePlay}
      aria-label={label}
      data-tooltip={label}
      data-tooltip-shortcut="Space"
      whileHover={{ scale: 1.07 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 520, damping: 20 }}
    >
      <Swap id={buffering ? 'loading' : player.playing ? 'pause' : 'play'}>
        {buffering
          ? <Loader2 size={glyph} strokeWidth={2} className={styles.spin} aria-label="缓冲中" />
          : player.playing ? <Pause size={glyph} strokeWidth={0} fill="currentColor" /> : <Play size={glyph} strokeWidth={0} fill="currentColor" className={styles.playGlyph} />}
      </Swap>
    </motion.button>
  );
}

/** Like · previous · play · next · mode. */
export function Transport({ likeCount, large = false }: { likeCount?: number; large?: boolean }) {
  const player = usePlayer();
  const { track } = player;
  const skip = large ? 22 : 20;
  return (
    <div className={cn(styles.buttons, large && styles.buttonsLarge)}>
      {track.songId
        ? <LikeButton songId={track.songId} size="md" iconSize={18} count={likeCount} />
        : <IconButton label="喜欢" disabled><Heart size={18} strokeWidth={1.4} /></IconButton>}
      <IconButton label="上一首" onClick={player.previous} iconHover={{ x: -2, scale: 1.1 }}>
        <SkipBack size={skip} strokeWidth={1.4} />
      </IconButton>
      <PlayPauseButton large={large} />
      <IconButton label="下一首" onClick={player.next} iconHover={{ x: 2, scale: 1.1 }}>
        <SkipForward size={skip} strokeWidth={1.4} />
      </IconButton>
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

export function VolumeControl({ className }: { className?: string }) {
  const player = usePlayer();
  const VolumeIcon = player.volume === 0 ? VolumeX : player.volume < 0.5 ? Volume1 : Volume2;
  return (
    <div className={cn(styles.volume, className)}>
      <IconButton label={player.volume > 0 ? '静音' : '取消静音'} onClick={player.toggleMute} tone="muted">
        <VolumeIcon size={19} strokeWidth={1.4} />
      </IconButton>
      <Slider className={styles.volumeSlider} size="sm" value={Math.round(player.volume * 100)} max={100} step={1} onChange={value => player.setVolume(value / 100)} label="音量" formatValue={value => `${Math.round(value)}%`} />
    </div>
  );
}
