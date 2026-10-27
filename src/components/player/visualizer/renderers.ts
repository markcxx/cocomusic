import type { VisualizerColor, VisualizerTemplate } from '@/lib/settings';

/**
 * Canvas painters for the lyrics-page templates. Each takes smoothed bands
 * (0…1, bass first) and draws one frame in CSS pixels (context pre-scaled).
 * Painters are created per canvas, so stateful ones (particles) keep their state.
 */

export type Palette = { mode: VisualizerColor; base: string; accent: string; hue: number; /** 'custom' colour as "r, g, b". */ custom?: string };
export type Frame = { time: number; /** Seconds since the previous frame. */ delta: number };
export type Painter = (ctx: CanvasRenderingContext2D, width: number, height: number, bands: Float32Array, palette: Palette, frame: Frame) => void;

/** Canvas size around the record relative to the disc (keep in sync with .ringCanvas). */
export const RING_SCALE = 1.5;

/** 湖光蓝: a clear sky blue that reads on any artwork backdrop (the default). */
export const VISUALIZER_BLUE = '86, 168, 255';

/** Colour for the band at x (0…1 across the spectrum). */
function bandColor(palette: Palette, x: number, alpha: number) {
  if (palette.mode === 'aurora') return `hsla(${(palette.hue + x * 220) % 360}, 82%, 70%, ${alpha})`;
  if (palette.mode === 'white') return `rgba(255, 255, 255, ${alpha})`;
  if (palette.mode === 'blue') return `rgba(${VISUALIZER_BLUE}, ${alpha})`;
  if (palette.mode === 'custom') return `rgba(${palette.custom ?? VISUALIZER_BLUE}, ${alpha})`;
  return `rgba(${palette.mode === 'accent' ? palette.accent : palette.base}, ${alpha})`;
}

/** Bands mirrored into a closed loop (bass at top, treble at the bottom on both sides). */
function loop(bands: Float32Array) {
  const half = bands.length;
  return Array.from({ length: half * 2 }, (_, index) => bands[index < half ? index : half * 2 - 1 - index]);
}

/* ───────── Along the progress line ───────── */

/** Evenly spaced bars across the width, bass on the left (倒影). */
function barSlots(width: number, count: number) {
  const slot = width / count;
  const gap = Math.max(1.5, slot * 0.34);
  return { slot, gap, bar: Math.max(1.5, slot - gap) };
}

/** Rectangle with rounded corners. */
function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(radius, h / 2, w / 2));
  ctx.fill();
}

/**
 * 细线频谱: hair-thin, dense lines standing on the progress line. Quiet bands
 * keep a short stub so the strip reads as one continuous shape.
 */
const drawLines: Painter = (ctx, width, height, bands, palette) => {
  const slot = width / bands.length;
  const w = Math.max(1.6, Math.min(3.2, slot * 0.4));
  const fill = ctx.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, bandColor(palette, 0.2, 0.9));
  fill.addColorStop(1, bandColor(palette, 0.5, 0.45));
  for (let index = 0; index < bands.length; index += 1) {
    const value = bands[index];
    const h = Math.max(2, value * (height - 2));
    ctx.fillStyle = palette.mode === 'aurora' ? bandColor(palette, index / bands.length, 0.45 + value * 0.5) : fill;
    bar(ctx, index * slot + (slot - w) / 2, height - h, w, h, w / 2);
  }
};

/**
 * 柔光波: the spectrum as soft blurred hills behind the progress line. Each
 * layer fades from nearly clear at its crest to dense at the bottom, like
 * light pooling along the bar; a tall faint layer sits behind a brighter one.
 */
const drawGlow: Painter = (ctx, width, height, bands, palette) => {
  const layer = (scale: number, blur: number, alpha: number) => {
    const step = width / (bands.length - 1);
    const points = Array.from(bands, (value, index) => ({ x: index * step, y: height - 4 - value * (height - 14) * scale }));
    const crest = Math.min(...points.map(point => point.y));
    const fill = ctx.createLinearGradient(0, crest, 0, height);
    fill.addColorStop(0, bandColor(palette, 0.3, alpha * 0.08));
    fill.addColorStop(0.5, bandColor(palette, 0.4, alpha * 0.45));
    fill.addColorStop(1, bandColor(palette, 0.6, alpha));
    ctx.save();
    ctx.filter = `blur(${blur}px)`;
    ctx.fillStyle = fill;
    if (palette.mode === 'aurora') { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = horizontalAurora(ctx, width, palette, alpha * 0.6); }
    ctx.beginPath();
    ctx.moveTo(-blur * 2, height + blur);
    ctx.lineTo(-blur * 2, points[0].y);
    smoothOpen(ctx, points);
    ctx.lineTo(width + blur * 2, points[points.length - 1].y);
    ctx.lineTo(width + blur * 2, height + blur);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  layer(1, 18, 0.55);
  layer(0.6, 8, 0.85);
};

function horizontalAurora(ctx: CanvasRenderingContext2D, width: number, palette: Palette, alpha: number) {
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  for (let stop = 0; stop <= 4; stop += 1) gradient.addColorStop(stop / 4, bandColor(palette, stop / 4, alpha));
  return gradient;
}

/**
 * 镜面倒影: bars centred under the artwork, mirrored downward as a
 * dimmer reflection with a hairline gap.
 */
const drawMirror: Painter = (ctx, width, height, bands, palette) => {
  const { slot, gap, bar: w } = barSlots(width, bands.length);
  const axis = height * 0.56;
  for (let index = 0; index < bands.length; index += 1) {
    const value = bands[index];
    const up = Math.max(3, value * (axis - 2));
    const down = Math.max(2, up * 0.72);
    const x = index * slot + gap / 2;
    const color = palette.mode === 'aurora' ? index / bands.length : 0.2;
    ctx.fillStyle = bandColor(palette, color, 0.95);
    bar(ctx, x, axis - up, w, up, 1.5);
    ctx.fillStyle = bandColor(palette, color, 0.42);
    bar(ctx, x, axis + 2, w, down, 1.5);
  }
};

/* ───────── Around the record ───────── */

type Ring = { cx: number; cy: number; inner: number; reach: number };

/** Geometry for a square region centred in the canvas; the disc fills 1 / RING_SCALE of it. */
function ring(width: number, height: number): Ring {
  const size = Math.min(width, height);
  const inner = size / RING_SCALE / 2;
  return { cx: width / 2, cy: height / 2, inner, reach: size / 2 - inner };
}

function polar(r: Ring, angle: number, radius: number) {
  return { x: r.cx + Math.cos(angle) * radius, y: r.cy + Math.sin(angle) * radius };
}

/**
 * 跳动旋律: three thin smooth rings with big soft lobes, each turned a little
 * and scaled differently, so they weave over each other as the music moves.
 */
function melody(): Painter {
  return (ctx, width, height, bands, palette, frame) => {
    const r = ring(width, height);
    const values = loop(bands);
    const layers = [{ scale: 1, alpha: 0.95, turn: 0.12 }, { scale: 0.78, alpha: 0.6, turn: -0.08 }, { scale: 0.55, alpha: 0.4, turn: 0.05 }];
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 10;
    layers.forEach((layer, depth) => {
      const offset = frame.time * layer.turn + depth * 0.9;
      const points = values.map((value, index) => {
        const angle = (index / values.length) * Math.PI * 2 - Math.PI / 2 + offset;
        const wobble = Math.sin(frame.time * 1.3 + index * 1.1 + depth * 2) * 1.6;
        return polar(r, angle, r.inner + 3 + value * r.reach * 0.8 * layer.scale + wobble);
      });
      ctx.lineWidth = depth === 0 ? 1.8 : 1.2;
      ctx.strokeStyle = bandColor(palette, 0.2 + depth * 0.25, layer.alpha);
      ctx.shadowColor = bandColor(palette, 0.2, 0.55);
      smoothClosed(ctx, points);
      ctx.stroke();
    });
    ctx.restore();
  };
}

type Dot = { angle: number; radius: number; speed: number; size: number; life: number };

/**
 * 迷幻水波: a thin translucent membrane hugging the disc (soft fill, faint
 * rim) that bulges with the music, plus round motes that now and then drift
 * off it, fading as they travel and gone before the edge of the area.
 */
function ripple(): Painter {
  const dots: Dot[] = [];
  return (ctx, width, height, bands, palette, frame) => {
    const r = ring(width, height);
    const values = loop(bands);
    const dt = Math.min(0.05, frame.delta);
    const energy = values.reduce((sum, value) => sum + value, 0) / values.length;
    const membrane = (scale: number, phase: number) => values.map((value, index) => {
      const angle = (index / values.length) * Math.PI * 2 - Math.PI / 2 + Math.sin(frame.time * 0.35 + phase) * 0.2;
      const swell = Math.sin(frame.time * 1.6 + index * 0.9 + phase) * 1.5;
      return polar(r, angle, r.inner + 1 + value * r.reach * 0.42 * scale + swell);
    });
    ctx.save();
    // Back layer, a little larger and dimmer, gives the film some depth.
    ctx.fillStyle = bandColor(palette, 0.4, 0.14);
    smoothClosed(ctx, membrane(1.15, 2.1));
    ctx.fill();
    const front = membrane(1, 0);
    ctx.fillStyle = bandColor(palette, 0.25, 0.26);
    smoothClosed(ctx, front);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = bandColor(palette, 0.2, 0.38);
    ctx.stroke();

    // Motes: occasional, more when it is loud; they leave from the membrane.
    if (dots.length < 26 && Math.random() < (0.02 + energy * 0.22) * dt * 60) {
      const index = Math.floor(Math.random() * values.length);
      dots.push({ angle: (index / values.length) * Math.PI * 2 - Math.PI / 2, radius: r.inner + values[index] * r.reach * 0.42, speed: r.reach * (0.12 + Math.random() * 0.18), size: 1.5 + Math.random() * 2.6, life: 1 });
    }
    const limit = r.inner + r.reach * 0.95;
    for (let index = dots.length - 1; index >= 0; index -= 1) {
      const dot = dots[index];
      dot.radius += dot.speed * dt;
      dot.angle += 0.04 * dt;
      // Fade with distance travelled: brightest at the film, clear before the limit.
      const travel = (dot.radius - r.inner) / (limit - r.inner);
      dot.life = Math.min(dot.life, 1 - travel);
      if (dot.life <= 0) { dots.splice(index, 1); continue; }
      const point = polar(r, dot.angle, dot.radius);
      const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, dot.size * 2.2);
      glow.addColorStop(0, bandColor(palette, 0.3, 0.75 * dot.life));
      glow.addColorStop(0.45, bandColor(palette, 0.3, 0.4 * dot.life));
      glow.addColorStop(1, bandColor(palette, 0.3, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(point.x, point.y, dot.size * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };
}

/**
 * 动感音阶: one ring of fine radial ticks, each drawn twice along the same
 * line. The full tick is light and translucent; over its inner part lies a
 * second, denser stroke, so the root of every tick reads a shade deeper.
 * Both lengths follow the band (the deeper part about half the full one).
 */
function scale(): Painter {
  return (ctx, width, height, bands, palette) => {
    const r = ring(width, height);
    const values = loop(bands);
    const count = values.length;
    const start = r.inner + r.reach * 0.08;
    const spacing = (start * Math.PI * 2) / count;
    const lineWidth = Math.max(1.4, Math.min(3, spacing * 0.42));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = lineWidth;
    const stroke = (index: number, from: number, to: number, alpha: number) => {
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      const a = polar(r, angle, from);
      const b = polar(r, angle, to);
      ctx.strokeStyle = bandColor(palette, index / count, alpha);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };
    for (let index = 0; index < count; index += 1) {
      const value = values[index];
      // Resting length keeps the ring legible between beats.
      const full = 5 + value * r.reach * 0.78;
      stroke(index, start, start + full, 0.32);
      // Same tick, inner part: drawn again on top, so it reads a shade deeper.
      stroke(index, start, start + 3 + full * 0.48, 0.55);
    }
    ctx.restore();
  };
}

export function makePainter(template: VisualizerTemplate): Painter | null {
  switch (template) {
    case 'lines': return drawLines;
    case 'glow': return drawGlow;
    case 'mirror': return drawMirror;
    case 'melody': return melody();
    case 'ripple': return ripple();
    case 'scale': return scale();
    default: return null;
  }
}

/* ───────── Curves ───────── */

/** Open Catmull-Rom spline through the points (path already started at points[0]). */
function smoothOpen(ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    ctx.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
  }
}

/** Closed Catmull-Rom spline through the points, as cubic Béziers. */
function smoothClosed(ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>) {
  const count = points.length;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 0; index < count; index += 1) {
    const p0 = points[(index - 1 + count) % count];
    const p1 = points[index];
    const p2 = points[(index + 1) % count];
    const p3 = points[(index + 2) % count];
    ctx.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
  }
  ctx.closePath();
}
