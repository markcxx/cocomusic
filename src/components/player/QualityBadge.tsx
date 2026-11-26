'use client';

import { useCallback, useRef, useState } from 'react';
import { IconButton, Menu, toast, type MenuItem } from '@/components/ui';
import { settings, useSettings } from '@/lib/settings';
import { SOURCE_NAMES } from '@/server/music/ids';
import type { AudioQuality } from '@/server/music/types';
import { isPlayable } from '@/types/music';
import { formatTime, usePlayer } from './player-store';
import styles from './QualityBadge.module.css';

const QUALITY_LABELS: Record<AudioQuality, string> = {
  standard: '标准',
  higher: '较高',
  exhigh: '极高',
  lossless: '无损',
  hires: 'Hi-Res',
};

const QUALITY_HINTS: Record<AudioQuality, string> = {
  standard: '128k',
  higher: '192k',
  exhigh: '320k',
  lossless: 'FLAC',
  hires: '24bit',
};

const QUALITY_ORDER: readonly AudioQuality[] = ['standard', 'higher', 'exhigh', 'lossless', 'hires'];

function formatBitrate(bps?: number) {
  if (!bps || bps <= 0) return null;
  return `${Math.round(bps / 1000)}k`;
}

/**
 * Outlined stream-quality glyph button matching the MV button's visual weight,
 * backed by the app's native <Menu> item list.
 */
export function QualityBadge() {
  const player = usePlayer();
  const preferred = useSettings().quality;
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const { track, level, bitrate, trial } = player;
  if (!isPlayable(track)) return null;

  const isLocal = Boolean(track.localId);
  const activeQuality = (level && level in QUALITY_LABELS ? level : preferred) as AudioQuality;
  const badgeText = isLocal ? '本地' : trial ? '试听' : QUALITY_LABELS[activeQuality];
  const kbps = formatBitrate(bitrate);
  const sourceName = isLocal ? '本地文件' : SOURCE_NAMES[player.alternatePlatform ?? track.source ?? 'netease'];

  const tooltip = isLocal
    ? '本地音频原盘播放'
    : trial
      ? `试听片段（${formatTime(trial.start)}–${formatTime(trial.end)}）· 点击切换偏好音质`
      : `当前音质：${QUALITY_LABELS[activeQuality]}${kbps ? ` (${kbps})` : ''}`;

  const items: MenuItem[] = [
    { type: 'section', label: kbps && !trial ? `在线播放音质 · 当前 ${kbps}` : `在线播放音质 · ${sourceName}` },
    ...QUALITY_ORDER.map((quality): MenuItem => ({
      label: QUALITY_LABELS[quality],
      hint: !trial && level === quality && preferred !== quality ? '当前生效' : QUALITY_HINTS[quality],
      selected: quality === preferred,
      onSelect: () => {
        if (quality === preferred) return;
        settings.set('quality', quality);
        player.reloadStream();
        toast.info(`已切换为${QUALITY_LABELS[quality]}音质，无权限时会自动降级`);
      },
    })),
  ];

  return (
    <>
      <span ref={anchor} className={styles.wrap}>
        <IconButton
          label={`音质：${badgeText}`}
          tooltip={open ? undefined : tooltip}
          tone="muted"
          disabled={isLocal}
          active={open}
          onClick={() => setOpen(value => !value)}
        >
          <span className={styles.glyph}>{badgeText}</span>
        </IconButton>
      </span>
      <Menu open={open} anchor={anchor} items={items} onClose={close} align="end" placement="top" />
    </>
  );
}
