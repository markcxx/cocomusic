'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { parseHex, rgbTriplet } from '@/lib/color';
import { isRingTemplate, stripTemplate, useSettings, type VisualizerColor, type VisualizerTemplate } from '@/lib/settings';
import { useLatest } from '@/lib/use-latest';
import { usePlayer } from '../player-store';
import { analyserFor, canEverRoute } from './audio-graph';
import { useCoverTint } from './cover-tint';
import { makePainter, type Painter, type Palette } from './renderers';
import { Spectrum } from './spectrum';
import styles from './Visualizer.module.css';

/** Bands per template and density (ring templates mirror them into a full circle). */
const BANDS: Record<VisualizerTemplate, { normal: number; fine: number }> = {
  off: { normal: 0, fine: 0 },
  roaming: { normal: 0, fine: 0 },
  lines: { normal: 110, fine: 170 },
  glow: { normal: 40, fine: 64 },
  mirror: { normal: 56, fine: 88 },
  vinyl: { normal: 0, fine: 0 },
  melody: { normal: 18, fine: 28 },
  ripple: { normal: 18, fine: 26 },
  scale: { normal: 60, fine: 90 },
};

export function bandCount(template: VisualizerTemplate, density: 'normal' | 'fine') {
  return BANDS[template][density];
}

/** Accent colour as "r, g, b" (from the theme's CSS variable). */
function accentRgb() {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const rgb = parseHex(value);
  return rgb ? rgbTriplet(rgb) : '199, 184, 234';
}

type LoopOptions = { active: boolean; color: VisualizerColor; tint: string; custom?: string; synthetic?: boolean };

/**
 * Drives one canvas: sizes it for the device pixel ratio, samples the shared
 * analyser each frame (or synthetic motion when `synthetic` / unavailable)
 * and paints the template. Returns a callback ref for the <canvas>.
 * The loop idles once playback stops and the bands settle.
 */
export function useVisualizerCanvas(template: VisualizerTemplate, options: LoopOptions & { bands: number }) {
  const { audioElement } = usePlayer();
  const latest = useLatest(options);
  const { bands, active } = options;
  const [element, setElement] = useState<HTMLCanvasElement | null>(null);
  // A fresh painter per template keeps stateful ones (ripple motes) separate per canvas.
  const painter = useMemo(() => makePainter(template), [template]);
  // The bands outlive loop restarts: pausing restarts the loop, and a fresh
  // spectrum there would drop every band to zero at once instead of easing down.
  const spectrum = useMemo(() => (bands ? new Spectrum(bands) : null), [bands]);

  useEffect(() => {
    if (!element || !spectrum || !painter) return;
    return runLoop(element, spectrum, painter, latest, audioElement);
    // `active` wakes an idle loop; the other options are read live.
  }, [element, spectrum, painter, active, latest, audioElement]);
  return setElement;
}

/** The animation loop for one canvas; returns its stop function. */
function runLoop(element: HTMLCanvasElement, spectrum: Spectrum, paint: Painter, latest: { current: LoopOptions }, audioElement: () => HTMLAudioElement | null) {
  const ctx = element.getContext('2d');
  if (!ctx) return undefined;
  const accent = accentRgb();
  const hue = Math.random() * 360;
  let width = 0;
  let height = 0;
  let frame = 0;
  let last = performance.now();

  const resize = () => {
    const rect = element.getBoundingClientRect();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    width = rect.width;
    height = rect.height;
    element.width = Math.max(1, Math.round(width * ratio));
    element.height = Math.max(1, Math.round(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(element);

  const tick = (now: number) => {
    const current = latest.current;
    const delta = Math.min(0.064, (now - last) / 1000);
    last = now;
    const audio = current.synthetic ? null : audioElement();
    const graph = audio ? analyserFor(audio) : null;
    // Real samples whenever the stream can be read; between songs (no source
    // yet) or paused the bands sink back to rest instead of faking motion.
    // Synthetic motion only for previews and plain browsers (no CORS there).
    const values = graph
      ? spectrum.sample(graph.analyser, graph.bins, current.active && !audio!.paused)
      : current.synthetic || !canEverRoute()
        ? spectrum.synthetic(now / 1000, current.active)
        : spectrum.sample(null, null, false);
    ctx.clearRect(0, 0, width, height);
    const palette: Palette = { mode: current.color, base: current.tint, accent, hue: (hue + now / 120) % 360, custom: current.custom };
    paint(ctx, width, height, values, palette, { time: now / 1000, delta });
    // Nothing left to animate: stop until something changes.
    if (!current.active && !spectrum.moving()) { frame = 0; return; }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(frame); observer.disconnect(); };
}

/** Current template (off under 减少动效), play state and colour inputs. */
export function useVisualizer() {
  const prefs = useSettings();
  const { track, playing } = usePlayer();
  const tint = useCoverTint(track.cover, track.coverSeed);
  const template: VisualizerTemplate = prefs.reduceMotion ? 'off' : prefs.lyricsVisualizer;
  const custom = parseHex(prefs.lyricsVisualizerCustomColor);
  return { template, strip: stripTemplate(template, prefs.lyricsVinylEffect), playing: playing && !prefs.reduceMotion, tint, color: prefs.lyricsVisualizerColor, custom: custom ? rgbTriplet(custom) : undefined, density: prefs.lyricsVisualizerDensity };
}

/** One live canvas for `template` (positioned by the caller's class). */
export function VisualizerCanvas({ template, className }: { template: VisualizerTemplate; className?: string }) {
  const { playing, tint, color, custom, density } = useVisualizer();
  const ref = useVisualizerCanvas(template, { bands: bandCount(template, density), active: playing, color, tint, custom });
  return <canvas ref={ref} className={className} aria-hidden />;
}

/** 频谱柱 / 柔光波: full-width strip standing on the lyrics bar's progress line. */
export function ProgressVisualizer() {
  const { strip } = useVisualizer();
  if (!strip) return null;
  return <VisualizerCanvas key={strip} template={strip} className={cn(styles.progress, strip === 'glow' && styles.progressGlow)} />;
}

/** Ring templates: canvas centred on the record, RING_SCALE × its size. */
export function RingVisualizer() {
  const { template } = useVisualizer();
  if (!isRingTemplate(template)) return null;
  return <VisualizerCanvas key={template} template={template} className={styles.ring} />;
}

/** 倒影柱: under the artwork. */
export function MirrorVisualizer() {
  const { template } = useVisualizer();
  if (template !== 'mirror') return null;
  return <VisualizerCanvas template="mirror" className={styles.mirror} />;
}

/** A fixed, representative frame; redraw only when size or appearance changes. */
export function TemplatePreview({ template, color, tint, className }: { template: VisualizerTemplate; color: VisualizerColor; tint: string; className?: string }) {
  const { custom } = useVisualizer();
  const bands = Math.max(8, Math.round(bandCount(template, 'normal') * (isRingTemplate(template) ? 0.8 : 0.45)));
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ctx = element.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      const { width, height } = element.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      element.width = Math.max(1, Math.round(width * ratio));
      element.height = Math.max(1, Math.round(height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const paint = makePainter(template);
      if (!paint || !width || !height) return;
      const spectrum = new Spectrum(bands);
      const palette: Palette = { mode: color, base: tint, accent: accentRgb(), hue: 265, custom };
      // Settle the spectrum and stateful effects at a fixed moment, without a RAF loop.
      for (let step = 0; step < 45; step += 1) {
        const time = 2 + step / 60;
        ctx.clearRect(0, 0, width, height);
        paint(ctx, width, height, spectrum.synthetic(time, true), palette, { time, delta: 1 / 60 });
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [template, bands, color, tint, custom]);
  return <canvas ref={canvas} className={className} aria-hidden />;
}
