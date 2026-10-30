import { mulberry32 } from './seed';
import type { Station } from './timeline';

/**
 * Camera vocabulary: one move per lyric line, played over the line's span.
 *
 * Every move is a pose offset in the line's local frame (right / up / back,
 * plus a small aim offset), given as a function of eased progress t ∈ 0…1
 * and a handedness `s` (±1) that mirrors it left/right. The director blends
 * from the previous line's pose into this one, so moves never cut.
 */

export type ShotName =
  | 'push' | 'pull' | 'orbit' | 'track' | 'crane' | 'swell' | 'spiral'
  | 'pendulum' | 'flyby' | 'arc' | 'float' | 'glide' | 'hold';

export type Pose = {
  /** Sideways (right), vertical (up) and distance (back from the text). */
  x: number;
  y: number;
  back: number;
  /** Orbit angle around the text's up axis (radians). */
  orbit: number;
  /** Extra aim offset at the text (right / up). */
  aimX: number;
  aimY: number;
};

export const NEUTRAL: Pose = { x: 0, y: 0.5, back: 5.2, orbit: 0, aimX: 0, aimY: 0 };

type Move = (t: number, s: number, amp: number) => Partial<Pose>;

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const bump = (t: number) => Math.sin(Math.PI * t);

const MOVES: Record<ShotName, Move> = {
  push: (t, _s, a) => ({ back: lerp(7.6, 4.3, ease(t)) * (1 + (a - 1) * 0.15), y: lerp(1.3, 0.35, ease(t)) }),
  pull: (t, _s, a) => ({ back: lerp(3.9, 7.4, ease(t)), y: lerp(0.2, 1.5 * a, ease(t)) }),
  orbit: (t, s, a) => ({ orbit: s * lerp(-0.52, 0.52, ease(t)) * a, back: 5.6 }),
  track: (t, s, a) => ({ x: s * lerp(-0.7, 0.7, t) * a, orbit: s * bump(t) * 0.22 * a }),
  crane: (t, s, a) => ({ y: lerp(s > 0 ? -1.4 : 2.2, s > 0 ? 2.2 : -1.2, ease(t)) * a, aimY: lerp(0.3, -0.2, t) * s }),
  swell: (t, s, a) => ({ back: 5.2 + bump(t) * 1.3, y: 0.5 + bump(t) * 1.1 * a, x: s * bump(t) * 0.9 * a }),
  spiral: (t, s, a) => ({ orbit: s * lerp(-0.6, 0.45, ease(t)) * a, y: lerp(-1, 1.8, ease(t)) * a }),
  pendulum: (t, s, a) => ({ x: s * Math.cos(Math.PI * t) * 1.5 * a, y: 0.5 + (1 - bump(t)) * 1.1 * a - 0.5 }),
  flyby: (t, s, a) => ({ x: s * lerp(-2.6, 2.6, t) * a, back: 3.8 + Math.abs(t - 0.5) * 1.8, orbit: s * lerp(-0.18, 0.18, t) }),
  arc: (t, s, a) => ({ x: s * bump(t) * 2.2 * a, orbit: s * bump(t) * 0.3 * a, back: 5.6 }),
  float: (t, s) => ({ y: 0.5 + Math.sin(t * Math.PI * 2) * 0.22, x: s * Math.sin(t * Math.PI) * 0.18 }),
  glide: (t, s, a) => ({ x: s * lerp(-0.9, 0.5, ease(t)) * a, y: lerp(-0.3, 1.1, ease(t)) * a, back: lerp(5.8, 4.9, ease(t)) }),
  hold: () => ({}),
};

export function shotPose(name: ShotName, t: number, side: number, amplitude: number): Pose {
  return { ...NEUTRAL, ...MOVES[name](Math.min(1, Math.max(0, t)), side, amplitude) };
}

/** How much a shot squares the camera up to the text while it is being read (0…1). */
export const ALIGN: Record<ShotName, number> = {
  hold: 0.9, push: 0.88, track: 0.85, glide: 0.8, float: 0.8, pull: 0.75, crane: 0.7, swell: 0.7,
  pendulum: 0.65, arc: 0.6, orbit: 0.5, spiral: 0.5, flyby: 0.45,
};

export type Mood = 'calm' | 'normal' | 'lively';

const MOOD_AMPLITUDE: Record<Mood, number> = { calm: 0.6, normal: 1, lively: 1.35 };
const MOOD_BIAS: Record<Mood, Partial<Record<ShotName, number>>> = {
  calm: { hold: 2.2, float: 2, swell: 1.8, glide: 1.8, flyby: 0.2, spiral: 0.4, orbit: 0.6 },
  normal: {},
  lively: { orbit: 2, spiral: 2, flyby: 2, pendulum: 1.8, hold: 0.15, float: 0.3 },
};

/**
 * Pick one shot per station, deterministically per song: the line's role
 * (chorus / verse / section start), its length and delivery weight the
 * choice; a move is never reused within three lines.
 */
export function planShots(stations: Station[], seed: number, mood: Mood) {
  const rng = mulberry32(seed ^ 0x51ed27);
  const recent: ShotName[] = [];
  const all = Object.keys(MOVES) as ShotName[];
  return stations.map(station => {
    const weight: Record<ShotName, number> = Object.fromEntries(all.map(name => [name, 1])) as Record<ShotName, number>;
    const bias = (names: ShotName[], by: number) => names.forEach(name => { weight[name] *= by; });
    if (station.chorus) bias(['orbit', 'push', 'spiral', 'arc'], 2.4); else bias(['track', 'crane', 'hold', 'pendulum', 'float'], 1.7);
    const length = Array.from(station.text).length;
    if (length > 18) bias(['track', 'pull'], 2.2);
    if (length <= 5) bias(['push', 'orbit'], 2.2);
    if (station.sectionStart) bias(['pull', 'crane', 'glide'], 2.6);
    if (station.held) bias(['swell', 'spiral', 'float'], 2);
    if (station.staccato) bias(['track', 'flyby'], 2);
    for (const [name, by] of Object.entries(MOOD_BIAS[mood])) weight[name as ShotName] *= by;
    for (const name of recent) weight[name] = 0;
    const total = all.reduce((sum, name) => sum + weight[name], 0);
    let roll = rng() * total;
    let pick: ShotName = 'hold';
    for (const name of all) { roll -= weight[name]; if (roll <= 0) { pick = name; break; } }
    recent.push(pick);
    if (recent.length > 3) recent.shift();
    return { name: pick, side: rng() < 0.5 ? -1 : 1, amplitude: MOOD_AMPLITUDE[mood] };
  });
}
