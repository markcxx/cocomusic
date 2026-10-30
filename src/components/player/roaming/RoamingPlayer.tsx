'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '@/lib/settings';
import { LyricsPanel } from '../LyricsPanel';
import { usePlaybackPosition, usePlayer } from '../player-store';
import { useTrackLyrics } from '../use-track-lyrics';
import { analyserFor } from '../visualizer/audio-graph';
import { useCoverTint } from '../visualizer/cover-tint';
import { RoamingEngine, type EngineOptions } from './engine';
import styles from './RoamingPlayer.module.css';

/** The app's lyric font stack (falls back through CJK system fonts). */
function lyricFont() {
  const css = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim();
  return css || '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';
}

/** Index of the lyric line sung at `time` (−1 before the first). */
function lineAt(lines: Array<{ time: number }>, time: number) {
  let low = 0;
  let high = lines.length;
  while (low < high) { const mid = (low + high) >>> 1; if (lines[mid].time <= time) low = mid + 1; else high = mid; }
  return low - 1;
}

/** WebGL available at all? (old GPUs, disabled acceleration). */
function webglOk() {
  try { return Boolean(document.createElement('canvas').getContext('webgl2')); } catch { return false; }
}

/**
 * 星河漫游 host: mounts the WebGL engine over the lyrics page's blurred cover,
 * feeds it song and clock each frame, and shows the flat parts — translation subtitle, "waiting for
 * lyrics" hint — over the canvas. Falls back to the normal lyric column when
 * WebGL is unavailable or motion is reduced.
 */
function Scene() {
  const { track, trial, duration, playing, audioElement } = usePlayer();
  const prefs = useSettings();
  const lyrics = useTrackLyrics(track);
  const position = usePlaybackPosition();
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<RoamingEngine | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(-1);

  // Sung text takes the artwork's theme colour (a custom colour from 设置 › 播放器模式配色 overrides it).
  const tint = useCoverTint(track.cover, track.coverSeed);
  const accent = prefs.lyricsVisualizerColor === 'custom' ? prefs.lyricsVisualizerCustomColor : `rgb(${tint})`;
  const options = useMemo<EngineOptions>(() => ({
    font: { family: typeof document === 'undefined' ? 'sans-serif' : lyricFont(), weight: 700 },
    fontScale: prefs.lyricsFontSize / 18,
    mood: 'normal',
    variety: 1,
  }), [prefs.lyricsFontSize]);

  const offset = (trial?.start ?? 0) + prefs.lyricsOffset;
  const synced = Boolean(lyrics.data?.synced);
  const lines = useMemo(() => (synced ? lyrics.data!.lines : []), [synced, lyrics.data]);
  const songDuration = trial ? (track.duration ?? duration + trial.start) : duration;

  // Engine lifetime.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let instance: RoamingEngine;
    try { instance = new RoamingEngine(element, options); } catch {
      // Context creation failed: show the plain lyrics (deferred, not during the effect body).
      const timer = setTimeout(() => setFailed(true), 0);
      return () => clearTimeout(timer);
    }
    engine.current = instance;
    const resize = () => { const rect = element.getBoundingClientRect(); instance.resize(rect.width, rect.height); };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    const lost = (event: Event) => { event.preventDefault(); setFailed(true); };
    element.addEventListener('webglcontextlost', lost);
    return () => { observer.disconnect(); element.removeEventListener('webglcontextlost', lost); instance.dispose(); engine.current = null; };
    // Options are applied live below; the engine is created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { engine.current?.setOptions(options); }, [options]);

  // Song / lyrics → engine. Wait briefly for lyrics so the flight lands on words.
  const lyricsReady = !lyrics.loading;
  useEffect(() => {
    if (!engine.current || !lyricsReady) return;
    engine.current.setSong({ id: track.id, lines, duration: songDuration || 0, accent, tint });
  }, [track.id, lines, songDuration, accent, tint, lyricsReady]);

  // Frame loop: clock from the element itself (smoother than React state).
  const live = useRef({ playing, offset, position, lines });
  useEffect(() => { live.current = { playing, offset, position, lines }; });
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let lastIndex = Number.NaN;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const instance = engine.current;
      const { playing: isPlaying, offset: shift, position: fallback, lines: current } = live.current;
      const audio = audioElement();
      const time = (audio && Number.isFinite(audio.currentTime) ? audio.currentTime : fallback) + shift;
      // Bass for the notes' beat bounce (the stream is CORS-loaded for this mode).
      const graph = audio && isPlaying ? analyserFor(audio) : null;
      if (graph) graph.analyser.getByteFrequencyData(graph.bins);
      instance?.frame(time, dt, now / 1000, isPlaying, graph ? graph.bins : null, graph?.context.sampleRate ?? 48000);
      // Translation subtitle follows the sung line (React only re-renders on line change).
      const sung = lineAt(current, time);
      if (sung !== lastIndex) { lastIndex = sung; setIndex(sung); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [audioElement]);

  if (failed) return <div className={styles.fallback}><p>当前设备无法显示 3D 效果，已显示普通歌词</p><LyricsPanel /></div>;

  const line = index >= 0 ? lines[index] : undefined;
  const translation = prefs.lyricsShowTranslation ? line?.translation : undefined;
  const waiting = synced && lines.length > 0 && index < 0;
  return (
    <>
      <canvas ref={canvas} className={styles.canvas} aria-hidden />
      {/* Screen readers get the plain current line. */}
      <p className={styles.srOnly} aria-live="polite">{line?.text}</p>
      <AnimatePresence mode="wait">
        {translation && (
          <motion.p key={`${index}:${translation}`} className={styles.translation} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 0.6, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.35 }}>
            {translation}
          </motion.p>
        )}
        {waiting && (
          <motion.p key="waiting" className={styles.waiting} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            歌词即将开始
          </motion.p>
        )}
        {!lyrics.loading && !synced && (
          <motion.p key="none" className={styles.waiting} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {lyrics.data?.instrumental ? '纯音乐，请欣赏' : lyrics.data?.lines.length ? '这首歌的歌词没有时间轴，无法在空间中展开' : '暂无歌词'}
          </motion.p>
        )}
      </AnimatePresence>
    </>
  );
}

export default function RoamingPlayer() {
  const { reduceMotion } = useSettings();
  const systemReduced = useReducedMotion();
  const [supported] = useState(() => typeof document !== 'undefined' && webglOk());
  const fallback = reduceMotion || systemReduced || !supported;
  return (
    <div className={styles.root} data-lyric-mode="roaming">
      {fallback ? <div className={styles.fallback}>{!supported && <p>当前设备无法显示 3D 效果，已显示普通歌词</p>}<LyricsPanel /></div> : <Scene />}
    </div>
  );
}
