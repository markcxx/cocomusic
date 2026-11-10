'use client';

import { useEffect } from 'react';
import { usePlayer } from '@/components/player/player-store';
import { useCoverTint } from '@/components/player/visualizer/cover-tint';
import { parseHex, toHex } from '@/lib/color';
import { coverAccent } from '@/lib/cover-accent';
import { useSettings } from '@/lib/settings';

const GLIDE_MS = 700;

/**
 * 设置 › 主题色 › 跟随封面: publishes the playing cover's colour for ApplyAppearance,
 * gliding from the previous song's colour so a skip does not flash the whole window.
 * Renders nothing; lives inside the player provider.
 */
export function CoverAccent() {
  const { accentFollowsCover } = useSettings();
  const { track } = usePlayer();
  const tint = useCoverTint(accentFollowsCover ? track.cover : undefined, track.coverSeed);
  const target = track.cover || track.songId || track.localId ? tint : null;

  useEffect(() => {
    if (!accentFollowsCover || !target) { coverAccent.set(null); return; }
    const [r, g, b] = target.split(',').map(Number);
    const from = parseHex(coverAccent.get() ?? '') ?? { r, g, b };
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / GLIDE_MS);
      const eased = 1 - (1 - t) ** 3;
      coverAccent.set(toHex({ r: from.r + (r - from.r) * eased, g: from.g + (g - from.g) * eased, b: from.b + (b - from.b) * eased }));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [accentFollowsCover, target]);

  return null;
}
