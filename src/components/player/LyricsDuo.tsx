'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { useSettings } from '@/lib/settings';
import { activeLineIndex } from '@/server/music/lrc';
import { usePlaybackPosition, usePlayer } from './player-store';
import { useTrackLyrics } from './use-track-lyrics';
import styles from './LyricsDrawer.module.css';

const LEAD_SECONDS = 0.25;

/**
 * 居中布局's lyrics: at most two lines under the artwork, the current line
 * bright and the next one dimmed. Each change slides the pair up.
 */
export function LyricsDuo() {
  const { track, trial } = usePlayer();
  const lyrics = useTrackLyrics(track);
  const position = usePlaybackPosition();
  const prefs = useSettings();
  const lines = useMemo(() => lyrics.data?.lines ?? [], [lyrics.data]);
  const synced = Boolean(lyrics.data?.synced);
  const active = synced ? activeLineIndex(lines, position + (trial?.start ?? 0) + LEAD_SECONDS + prefs.lyricsOffset) : 0;

  let status = '';
  if (!(track.localId ?? track.songId)) status = '选择一首歌曲开始播放';
  else if (lyrics.loading) status = '正在加载歌词';
  else if (lyrics.data?.instrumental) status = '纯音乐，请欣赏';
  else if (!lines.length) status = lyrics.error ? '歌词加载失败' : '暂无歌词';

  const current = lines[Math.max(0, active)];
  const next = lines[Math.max(0, active) + 1];
  const translation = prefs.lyricsShowTranslation ? current?.translation : undefined;

  return (
    <div className={styles.duo} aria-live="polite" style={{ '--lyric-size': `${prefs.lyricsFontSize}px` } as React.CSSProperties}>
      <AnimatePresence mode="popLayout" initial={false}>
        {status ? (
          <motion.p key="status" className={styles.duoNext} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{status}</motion.p>
        ) : (
          <motion.div
            key={`${track.id}:${active}`}
            className={styles.duoPair}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className={styles.duoCurrent}>{current?.text}</p>
            {/* Second line: the translation when shown, else the next lyric. */}
            {translation ? <p className={styles.duoNext}>{translation}</p> : next ? <p className={styles.duoNext}>{next.text}</p> : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
