import { useId, type ReactNode } from 'react';
import type { VisualizerTemplate } from '@/lib/settings';
import { bandColor, type Palette } from './renderers';

/**
 * Static illustrations for 播放器模式 tiles: one still frame of each effect,
 * drawn as SVG the way renderers.ts paints it (same shapes, same colours from
 * 设置 › 歌词页 › 播放器模式配色). No canvas, no audio, no artwork image, so
 * opening the picker is just eight small SVGs.
 */

const W = 160;
const H = 100;

/** Fixed "spectrum": smooth and varied, louder in the bass like real music. */
const level = (i: number, n: number) => {
  const x = i / n;
  const shape = 0.35 + 0.65 * (1 - x) ** 0.6;
  const ripple = 0.55 + 0.45 * Math.abs(Math.sin(i * 0.9 + 0.6) * Math.cos(i * 0.37 + 1.1));
  return Math.min(1, shape * ripple + 0.08);
};

type P = { x: number; y: number };
const fmt = (n: number) => n.toFixed(2);

/** Closed Catmull-Rom spline through the points (as renderers.ts smoothClosed). */
function closedPath(points: P[]) {
  const n = points.length;
  let d = `M${fmt(points[0].x)},${fmt(points[0].y)}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n]; const p1 = points[i]; const p2 = points[(i + 1) % n]; const p3 = points[(i + 2) % n];
    d += ` C${fmt(p1.x + (p2.x - p0.x) / 6)},${fmt(p1.y + (p2.y - p0.y) / 6)} ${fmt(p2.x - (p3.x - p1.x) / 6)},${fmt(p2.y - (p3.y - p1.y) / 6)} ${fmt(p2.x)},${fmt(p2.y)}`;
  }
  return `${d} Z`;
}

/** Open spline from points[0] to the last point. */
function openPath(points: P[]) {
  let d = `M${fmt(points[0].x)},${fmt(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]; const p1 = points[i]; const p2 = points[i + 1]; const p3 = points[Math.min(points.length - 1, i + 2)];
    d += ` C${fmt(p1.x + (p2.x - p0.x) / 6)},${fmt(p1.y + (p2.y - p0.y) / 6)} ${fmt(p2.x - (p3.x - p1.x) / 6)},${fmt(p2.y - (p3.y - p1.y) / 6)} ${fmt(p2.x)},${fmt(p2.y)}`;
  }
  return d;
}

/** Stable pseudo-random 0…1 (scattered, no visible rows or columns). */
const hash = (i: number) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

const polar = (cx: number, cy: number, angle: number, r: number): P => ({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });

type Art = { id: string; palette: Palette; cover: string };

/** Dark lyrics-page backdrop lit by the effect's colour, plus the defs every frame uses. */
function Frame({ id, palette, cover, children, sky }: Art & { children: ReactNode; sky?: boolean }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: 'block' }} aria-hidden>
      <defs>
        <radialGradient id={`${id}-lightA`} cx="0.22" cy="0.4" r="0.55">
          <stop offset="0" stopColor={`rgb(${cover})`} stopOpacity="0.38" />
          <stop offset="1" stopColor={`rgb(${cover})`} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-lightB`} cx="0.8" cy="0.85" r="0.6">
          <stop offset="0" stopColor={bandColor(palette, 0.6, 1)} stopOpacity="0.22" />
          <stop offset="1" stopColor={bandColor(palette, 0.6, 1)} stopOpacity="0" />
        </radialGradient>
        {/* Artwork stand-in: the song's own tone (like the real cover), lit from the top-left. */}
        <linearGradient id={`${id}-cover`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`rgb(${cover})`} />
          <stop offset="1" stopColor={`rgb(${cover})`} stopOpacity="0.55" />
        </linearGradient>
        <radialGradient id={`${id}-sheen`} cx="0.3" cy="0.25" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-soft`} x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="2.2" /></filter>
        <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.4" /></filter>
      </defs>
      <rect width={W} height={H} fill={sky ? '#0a0c1c' : '#141220'} />
      {!sky && <><rect width={W} height={H} fill={`url(#${id}-lightA)`} /><rect width={W} height={H} fill={`url(#${id}-lightB)`} /></>}
      {children}
    </svg>
  );
}

function Cover({ id, x, y, size, round = false }: { id: string; x: number; y: number; size: number; round?: boolean }) {
  const r = round ? size / 2 : 3.5;
  return (
    <>
      <rect x={x} y={y + 2.5} width={size} height={size} rx={r} fill="#000" opacity={0.4} filter={`url(#${id}-glow)`} />
      <rect x={x} y={y} width={size} height={size} rx={r} fill="#1d1a2b" />
      <rect x={x} y={y} width={size} height={size} rx={r} fill={`url(#${id}-cover)`} />
      {!round && <>
        <circle cx={x + size * 0.72} cy={y + size * 0.7} r={size * 0.3} fill="#000" opacity={0.16} />
        <circle cx={x + size * 0.32} cy={y + size * 0.36} r={size * 0.14} fill="#fff" opacity={0.18} />
      </>}
      <rect x={x} y={y} width={size} height={size} rx={r} fill={`url(#${id}-sheen)`} />
    </>
  );
}

/** Three lyric strokes, the middle one current. */
function Lyrics({ x, y, width }: { x: number; y: number; width: number }) {
  return (
    <>
      <rect x={x} y={y} width={width * 0.8} height={2.6} rx={1.3} fill="#fff" opacity={0.22} />
      <rect x={x} y={y + 8} width={width} height={3.8} rx={1.9} fill="#fff" opacity={0.92} />
      <rect x={x} y={y + 17} width={width * 0.6} height={2.6} rx={1.3} fill="#fff" opacity={0.22} />
    </>
  );
}

function Progress({ y }: { y: number }) {
  return <><rect x={10} y={y} width={140} height={1.4} rx={0.7} fill="#fff" opacity={0.18} /><rect x={10} y={y} width={56} height={1.4} rx={0.7} fill="#fff" opacity={0.85} /></>;
}

/* ───────── Along the progress line ───────── */

function Lines(art: Art) {
  const n = 64;
  const slot = 140 / n;
  const base = 88;
  return (
    <Frame {...art}>
      <Cover id={art.id} x={22} y={18} size={42} />
      <Lyrics x={80} y={28} width={56} />
      {Array.from({ length: n }, (_, i) => {
        const h = Math.max(1.5, level(i, n) * 20);
        return <rect key={i} x={10 + i * slot + slot * 0.3} y={base - h} width={Math.max(0.9, slot * 0.4)} height={h} rx={0.5} fill={bandColor(art.palette, art.palette.mode === 'aurora' ? i / n : 0.2, 0.55 + level(i, n) * 0.4)} />;
      })}
      <Progress y={base + 2} />
    </Frame>
  );
}

function Glow(art: Art) {
  const n = 22;
  const base = 90;
  const hill = (scale: number) => openPath(Array.from({ length: n }, (_, i) => ({ x: 10 + (i * 140) / (n - 1), y: base - 2 - level(i, n) * 26 * scale })));
  const fill = (key: string, alpha: number) => (
    <linearGradient id={`${art.id}-${key}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={bandColor(art.palette, 0.3, 1)} stopOpacity={alpha * 0.1} />
      <stop offset="0.5" stopColor={bandColor(art.palette, 0.4, 1)} stopOpacity={alpha * 0.5} />
      <stop offset="1" stopColor={bandColor(art.palette, 0.5, 1)} stopOpacity={alpha} />
    </linearGradient>
  );
  const aurora = art.palette.mode === 'aurora' && (
    <linearGradient id={`${art.id}-hue`} x1="0" y1="0" x2="1" y2="0">
      {[0, 0.25, 0.5, 0.75, 1].map(x => <stop key={x} offset={x} stopColor={bandColor(art.palette, x, 1)} stopOpacity={0.75} />)}
    </linearGradient>
  );
  return (
    <Frame {...art}>
      <defs>{fill('back', 0.5)}{fill('front', 0.95)}{aurora}</defs>
      <Cover id={art.id} x={22} y={14} size={40} />
      <Lyrics x={80} y={24} width={56} />
      <path d={`${hill(1.25)} L150,${base} L10,${base} Z`} fill={`url(#${art.id}-${aurora ? 'hue' : 'back'})`} opacity={aurora ? 0.35 : 1} filter={`url(#${art.id}-soft)`} />
      <path d={`${hill(0.8)} L150,${base} L10,${base} Z`} fill={`url(#${art.id}-${aurora ? 'hue' : 'front'})`} opacity={aurora ? 0.7 : 1} filter={`url(#${art.id}-glow)`} />
      <Progress y={base + 1} />
    </Frame>
  );
}

function Mirror(art: Art) {
  const n = 24;
  const slot = 66 / n;
  const axis = 70;
  return (
    <Frame {...art}>
      <Cover id={art.id} x={27} y={12} size={32} />
      <Lyrics x={80} y={34} width={56} />
      {Array.from({ length: n }, (_, i) => {
        const up = Math.max(1.5, level(i, n) * 17);
        const x = 10 + i * slot + slot * 0.17;
        const c = art.palette.mode === 'aurora' ? i / n : 0.2;
        return (
          <g key={i}>
            <rect x={x} y={axis - up} width={slot * 0.66} height={up} rx={0.8} fill={bandColor(art.palette, c, 0.95)} />
            <rect x={x} y={axis + 1.2} width={slot * 0.66} height={up * 0.72} rx={0.8} fill={bandColor(art.palette, c, 0.32)} />
          </g>
        );
      })}
    </Frame>
  );
}

/* ───────── Around the record ───────── */

const CX = 42;
const CY = 50;
const INNER = 15;

function RingFrame({ art, children, cover = true }: { art: Art; children: ReactNode; cover?: boolean }) {
  return (
    <Frame {...art}>
      {children}
      {cover && <Cover id={art.id} x={CX - INNER} y={CY - INNER} size={INNER * 2} round />}
      <Lyrics x={84} y={38} width={56} />
    </Frame>
  );
}

/** Bands mirrored into a closed loop, bass at the top (as renderers.ts loop). */
const loop = (n: number) => Array.from({ length: n * 2 }, (_, i) => level(i < n ? i : n * 2 - 1 - i, n));

function Melody(art: Art) {
  const values = loop(14);
  const layers = [{ scale: 1, alpha: 0.95, turn: 0.15, width: 1.3 }, { scale: 0.78, alpha: 0.6, turn: 1.1, width: 0.9 }, { scale: 0.55, alpha: 0.4, turn: 2, width: 0.9 }];
  return (
    <RingFrame art={art}>
      {layers.map((layer, depth) => {
        const d = closedPath(values.map((value, i) => polar(CX, CY, (i / values.length) * Math.PI * 2 - Math.PI / 2 + layer.turn, INNER + 2 + value * 14 * layer.scale)));
        const color = bandColor(art.palette, 0.2 + depth * 0.25, layer.alpha);
        return (
          <g key={depth}>
            <path d={d} fill="none" stroke={color} strokeWidth={layer.width * 2.2} opacity={0.5} filter={`url(#${art.id}-glow)`} />
            <path d={d} fill="none" stroke={color} strokeWidth={layer.width} strokeLinejoin="round" />
          </g>
        );
      })}
    </RingFrame>
  );
}

function Ripple(art: Art) {
  const values = loop(14);
  const membrane = (scale: number, phase: number) => closedPath(values.map((value, i) => polar(CX, CY, (i / values.length) * Math.PI * 2 - Math.PI / 2 + phase, INNER + 1 + value * 9 * scale + Math.sin(i * 0.9 + phase * 3) * 0.6)));
  const motes = [[0.3, 27, 1.6, 0.8], [1.4, 31, 1.2, 0.5], [2.3, 25, 1.9, 0.9], [3.6, 33, 1.1, 0.35], [4.4, 28, 1.5, 0.7], [5.5, 30, 1.3, 0.55]];
  return (
    <RingFrame art={art}>
      <path d={membrane(1.15, 0.35)} fill={bandColor(art.palette, 0.4, 0.16)} />
      <path d={membrane(1, 0)} fill={bandColor(art.palette, 0.25, 0.28)} stroke={bandColor(art.palette, 0.2, 0.42)} strokeWidth={0.8} />
      {motes.map(([angle, r, size, life]) => {
        const p = polar(CX, CY, angle, r);
        return (
          <g key={angle}>
            <circle cx={p.x} cy={p.y} r={size * 2} fill={bandColor(art.palette, 0.3, 0.35 * life)} filter={`url(#${art.id}-glow)`} />
            <circle cx={p.x} cy={p.y} r={size * 0.8} fill={bandColor(art.palette, 0.3, 0.85 * life)} />
          </g>
        );
      })}
    </RingFrame>
  );
}

function Scale(art: Art) {
  const values = loop(30);
  const start = INNER + 1.5;
  return (
    <RingFrame art={art}>
      {values.map((value, i) => {
        const angle = (i / values.length) * Math.PI * 2 - Math.PI / 2;
        const full = 1.5 + value * 15;
        const a = polar(CX, CY, angle, start);
        const b = polar(CX, CY, angle, start + full);
        const c = polar(CX, CY, angle, start + 1 + full * 0.48);
        return (
          <g key={i} strokeLinecap="round" strokeWidth={0.9}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={bandColor(art.palette, i / values.length, 0.36)} />
            <line x1={a.x} y1={a.y} x2={c.x} y2={c.y} stroke={bandColor(art.palette, i / values.length, 0.7)} />
          </g>
        );
      })}
    </RingFrame>
  );
}

function Vinyl(art: Art) {
  const r = 27;
  return (
    <RingFrame art={art} cover={false}>
      <circle cx={CX} cy={CY + 3} r={r} fill="#000" opacity={0.5} filter={`url(#${art.id}-glow)`} />
      <circle cx={CX} cy={CY} r={r} fill="#111114" />
      {[24.5, 22, 19.5, 17].map(g => <circle key={g} cx={CX} cy={CY} r={g} fill="none" stroke="#fff" strokeOpacity={0.05} strokeWidth={0.6} />)}
      {/* Light sweeping across the grooves. */}
      <path d={`M${CX - 19},${CY - 19} A${r - 1},${r - 1} 0 0 1 ${CX + 8},${CY - r + 2}`} fill="none" stroke="#fff" strokeOpacity={0.16} strokeWidth={3} strokeLinecap="round" filter={`url(#${art.id}-glow)`} />
      <circle cx={CX} cy={CY} r={10.5} fill="#1d1a2b" />
      <circle cx={CX} cy={CY} r={10.5} fill={`url(#${art.id}-cover)`} />
      <circle cx={CX} cy={CY} r={10.5} fill={`url(#${art.id}-sheen)`} />
      <circle cx={CX} cy={CY} r={1.4} fill="#111114" />
      {/* Tonearm resting on the outer grooves. */}
      <circle cx={72} cy={17} r={3.2} fill="#d9d6e4" />
      <circle cx={72} cy={17} r={1.2} fill="#8f8ba0" />
      <path d="M72,17 L64,39 L57.5,45" fill="none" stroke="#e8e5f0" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={53.5} y={43} width={6} height={3.6} rx={0.8} fill="#e8e5f0" transform="rotate(-38 56.5 44.8)" />
    </RingFrame>
  );
}

/* ───────── 3D lyrics ───────── */

function Roaming(art: Art) {
  const { id, palette } = art;
  const stars = Array.from({ length: 40 }, (_, i) => ({ x: hash(i) * W, y: hash(i + 100) * H, r: 0.3 + hash(i + 200) * 0.6, o: 0.2 + hash(i + 300) * 0.6 }));
  return (
    <Frame {...art} sky>
      <defs>
        <linearGradient id={`${id}-band`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={bandColor(palette, 0, 1)} stopOpacity="0" />
          <stop offset="0.5" stopColor={bandColor(palette, 0.5, 1)} stopOpacity="0.32" />
          <stop offset="1" stopColor={bandColor(palette, 1, 1)} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M-10,92 C40,66 92,54 170,16 L170,44 C100,70 48,84 -10,108 Z" fill={`url(#${id}-band)`} filter={`url(#${id}-soft)`} />
      {stars.map((star, i) => <circle key={i} cx={star.x} cy={star.y} r={star.r} fill="#fff" opacity={star.o} />)}
      {[['♪', 14, 22, 15, -16, 0.7], ['♫', 136, 88, 15, 14, 0.6], ['♩', 50, 30, 8, 0, 0.35], ['♬', 140, 28, 9, 18, 0.4]].map(([glyph, x, y, size, rotate, opacity]) => (
        <text key={String(glyph)} x={Number(x)} y={Number(y)} fontSize={Number(size)} fill={bandColor(palette, 0.3, 1)} opacity={Number(opacity)} transform={`rotate(${rotate} ${x} ${y})`}>{glyph}</text>
      ))}
      {/* Lines receding toward the top right, the current one largest and nearest. */}
      <g transform="rotate(-10 80 50)" fill="#fff">
        <text x={98} y={26} fontSize={6} opacity={0.25}>沿着旋律</text>
        <text x={70} y={42} fontSize={9} opacity={0.5}>走向下一句</text>
        <text x={18} y={68} fontSize={15} fontWeight={700} letterSpacing={0.4}>让音乐靠近</text>
      </g>
    </Frame>
  );
}

const ART: Record<Exclude<VisualizerTemplate, 'off'>, (art: Art) => ReactNode> = {
  lines: Lines,
  glow: Glow,
  mirror: Mirror,
  vinyl: Vinyl,
  melody: Melody,
  ripple: Ripple,
  scale: Scale,
  roaming: Roaming,
};

/**
 * `palette` is the one the real effect would use (播放器模式配色); `cover` is
 * the song's tone as "r, g, b", for the artwork stand-in and backdrop light.
 */
export function TemplateArt({ template, palette, cover }: { template: Exclude<VisualizerTemplate, 'off'>; palette: Palette; cover: string }) {
  // Gradient ids must be unique per instance and safe inside url(#…).
  const id = `art${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const Draw = ART[template];
  return <Draw id={id} palette={palette} cover={cover} />;
}
