'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Languages, Lock, LockOpen, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { playerFollower, type PlayerMessage } from '@/components/player/player-broadcast';
import { useTrackLyrics } from '@/components/player/use-track-lyrics';
import { cn } from '@/lib/cn';
import { desktopLyricColor, settings as appSettings, useSettings } from '@/lib/settings';
import { activeLineIndex, lineProgress as sungFraction } from '@/server/music/lrc';
import styles from './DesktopLyrics.module.css';

type FollowedTrack = Extract<PlayerMessage, { type: 'track' }>['track'];
type Clock = { position: number; playing: boolean; at: number };

const FONT_MIN = 20;
const FONT_MAX = 64;
const FONT_STEP = 2;

/** Current song position, extrapolated from the last clock tick every frame. */
function useFollowedPosition(clock: Clock | null) {
  const [position, setPosition] = useState(0);
  useEffect(() => {
    if (!clock) return;
    const compute = () => clock.position + (clock.playing ? (playerFollower.now() - clock.at) / 1000 : 0);
    if (!clock.playing) { const id = requestAnimationFrame(() => setPosition(compute())); return () => cancelAnimationFrame(id); }
    let frame = 0;
    const tick = () => { setPosition(compute()); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clock]);
  return position;
}

/** "A−" / "A+" font-size glyph: a capital A with a small sign at its top-right. */
function FontGlyph({ sign }: { sign: '+' | '−' }) {
  return (
    <span className={styles.fontGlyph} aria-hidden>
      A<sup>{sign}</sup>
    </span>
  );
}

/** Hover-only control strip. Transport sits in the exact centre; extras flank it. */
function Controls({ locked, playing, fontSize, translation }: { locked: boolean; playing: boolean; fontSize: number; translation: boolean }) {
  const lockButton = (
    <button
      type="button"
      className={cn(styles.tool, locked && styles.on)}
      onClick={() => window.coco?.lyrics?.setLocked(!locked)}
      aria-label={locked ? '解锁' : '锁定'}
      data-tooltip={locked ? '解锁桌面歌词' : '锁定（鼠标可穿透）'}
    >
      {locked ? <Lock size={15} /> : <LockOpen size={15} />}
    </button>
  );

  // Locked: only the unlock button, centred.
  if (locked) return <div className={styles.controls}><span />{lockButton}<span /></div>;

  return (
    <div className={styles.controls}>
      <div className={styles.side} />
      <div className={styles.transport}>
        <button type="button" className={styles.tool} onClick={() => playerFollower.send('previous')} aria-label="上一首" data-tooltip="上一首"><SkipBack size={16} fill="currentColor" /></button>
        <button type="button" className={cn(styles.tool, styles.play)} onClick={() => playerFollower.send('toggle')} aria-label={playing ? '暂停' : '播放'} data-tooltip={playing ? '暂停' : '播放'}>
          {playing ? <Pause size={18} fill="currentColor" strokeWidth={0} /> : <Play size={18} fill="currentColor" strokeWidth={0} className={styles.playGlyph} />}
        </button>
        <button type="button" className={styles.tool} onClick={() => playerFollower.send('next')} aria-label="下一首" data-tooltip="下一首"><SkipForward size={16} fill="currentColor" /></button>
      </div>
      <div className={cn(styles.side, styles.sideEnd)}>
        <button type="button" className={styles.tool} onClick={() => appSettings.set('desktopFontSize', Math.max(FONT_MIN, fontSize - FONT_STEP))} disabled={fontSize <= FONT_MIN} aria-label="缩小字号" data-tooltip={`缩小字号（${fontSize}）`}>
          <FontGlyph sign="−" />
        </button>
        <button type="button" className={styles.tool} onClick={() => appSettings.set('desktopFontSize', Math.min(FONT_MAX, fontSize + FONT_STEP))} disabled={fontSize >= FONT_MAX} aria-label="放大字号" data-tooltip={`放大字号（${fontSize}）`}>
          <FontGlyph sign="+" />
        </button>
        <span className={styles.divider} aria-hidden />
        <button type="button" className={cn(styles.tool, translation && styles.on)} onClick={() => appSettings.set('desktopShowTranslation', !translation)} aria-label="翻译" aria-pressed={translation} data-tooltip={translation ? '隐藏翻译' : '显示翻译'}>
          <Languages size={15} />
        </button>
        {lockButton}
        <button type="button" className={styles.tool} onClick={() => window.coco?.lyrics?.setDesktop(false)} aria-label="关闭桌面歌词" data-tooltip="关闭桌面歌词"><X size={16} /></button>
      </div>
    </div>
  );
}

/**
 * Desktop lyrics window content. Transparent page: only the text (with a soft
 * outline for legibility on any wallpaper) and, on hover, a control strip.
 * Style comes from 设置 › 桌面歌词 and follows changes live from the main window.
 * Locked: text passes clicks through; the visible unlock button has a native hit area.
 */
export function DesktopLyrics() {
  const [track, setTrack] = useState<FollowedTrack | null>(null);
  const [trialStart, setTrialStart] = useState(0);
  const [clock, setClock] = useState<Clock | null>(null);
  const [locked, setLocked] = useState(false);
  const [hover, setHover] = useState(false);
  const prefs = useSettings();
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    document.documentElement.dataset.desktopLyrics = 'true';
    const off = playerFollower.subscribe(message => {
      if (message.type === 'track') { setTrack(message.track); setTrialStart(message.trialStart); }
      else if (message.type === 'clock') setClock({ position: message.position, playing: message.playing, at: message.at });
    });
    // Ask the main window for the current song (we may open mid-song).
    playerFollower.send('sync');
    const offLock = window.coco?.lyrics?.onLockChange(setLocked);
    return () => { off(); offLock?.(); clearTimeout(hideTimer.current); window.coco?.lyrics?.drag('end'); };
  }, []);

  const lyrics = useTrackLyrics(track ?? {});
  const position = useFollowedPosition(clock);
  const lines = useMemo(() => lyrics.data?.lines ?? [], [lyrics.data]);
  const synced = Boolean(lyrics.data?.synced);
  const time = position + trialStart + 0.15 + prefs.lyricsOffset;
  const index = synced ? activeLineIndex(lines, time) : -1;
  const line = index >= 0 ? lines[index] : undefined;
  const next = synced ? lines[index + 1] : undefined;
  // Karaoke fill: word timing when the platform has it (逐字), else spread until the next line.
  const lineProgress = sungFraction(line, next, time);
  const color = desktopLyricColor(prefs);

  const primary = !track ? 'CoCo Music' : line?.text || (lyrics.loading ? track.title : lines.length && !synced ? lines[0].text : track.title);
  const translation = prefs.desktopShowTranslation ? line?.translation : undefined;
  const secondLine = prefs.desktopSecondLine === 'none' ? '' : prefs.desktopSecondLine === 'translation' ? translation || next?.text || '' : next?.text || translation || '';
  const secondary = !track ? '在主窗口播放歌曲后，歌词会显示在这里' : line ? secondLine : track.artist;
  const fill = prefs.desktopKaraoke && synced ? lineProgress : 1;

  const onEnter = () => { clearTimeout(hideTimer.current); setHover(true); };
  const onLeave = () => { hideTimer.current = setTimeout(() => setHover(false), 600); };

  return (
    <main
      className={cn(styles.root, hover && !locked && styles.hovering, locked && styles.locked, !prefs.desktopStroke && styles.noStroke, styles[`align-${prefs.desktopAlign}`])}
      style={{ '--size': `${prefs.desktopFontSize}px`, '--from': color.from, '--to': color.to, '--weight': prefs.desktopFontWeight } as React.CSSProperties}
      onMouseEnter={onEnter}
      onMouseMove={onEnter}
      onMouseLeave={onLeave}
      onPointerEnter={onEnter}
      onPointerMove={onEnter}
      onPointerLeave={onLeave}
      onPointerDown={event => {
        // Drag the window from anywhere except the controls.
        if (locked || event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        window.coco?.lyrics?.drag('start');
      }}
      onPointerUp={() => window.coco?.lyrics?.drag('end')}
      onPointerCancel={() => window.coco?.lyrics?.drag('end')}
      onLostPointerCapture={() => window.coco?.lyrics?.drag('end')}
    >
      <AnimatePresence>
        {(hover || locked) && (
          <motion.div className={styles.controlsWrap} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            <Controls locked={locked} playing={Boolean(clock?.playing)} fontSize={prefs.desktopFontSize} translation={prefs.desktopShowTranslation} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className={styles.stage}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={`p:${index}:${primary}`}
            className={styles.primary}
            initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -18, filter: 'blur(6px)' }}
            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Two layers: dim base + bright fill clipped to the sung portion. */}
            <span className={styles.base}>{primary}</span>
            <span className={styles.fill} style={{ clipPath: `inset(0 ${100 - fill * 100}% 0 0)` }} aria-hidden>{primary}</span>
          </motion.p>
        </AnimatePresence>
        <AnimatePresence mode="popLayout" initial={false}>
          {secondary && (
            <motion.p
              key={`s:${index}:${secondary}`}
              className={styles.secondary}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, delay: 0.04 }}
            >
              {secondary}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
