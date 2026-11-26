'use client';

import { Slider } from '@/components/ui';
import { formatTime, usePlaybackPosition, usePlayer } from './player-store';
import { useProgressScrubber } from './use-progress-scrubber';
import styles from './PlayerBar.module.css';

/** Isolated so only this subtree re-renders on every playhead frame. */
export function ProgressBar() {
  const { duration, seek, trial } = usePlayer();
  const position = usePlaybackPosition();
  const { highlights, renderTooltip } = useProgressScrubber();
  return (
    <div className={styles.progress}>
      <time>{formatTime(position)}</time>
      <Slider
        value={Math.min(position, duration)}
        max={duration}
        onCommit={seek}
        label="播放进度"
        formatValue={formatTime}
        highlights={highlights}
        renderTooltip={renderTooltip}
      />
      <time data-tooltip={trial ? `试听片段（${formatTime(trial.start)}–${formatTime(trial.end)}），登录有权限的账号可播放完整歌曲` : undefined}>{formatTime(duration)}</time>
    </div>
  );
}
