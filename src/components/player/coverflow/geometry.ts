/**
 * Cover flow geometry and choreography, in units of the card width.
 *
 * Laid out after the reference shot: the centre cover faces the viewer; its
 * neighbours stand steeply turned (≈75°) towards the centre, a little nearer
 * than it, their spines (title · artist) towards the viewer, packed tight like
 * records on a shelf.
 */
export const FLOW = {
  /** Turn of every side card, degrees. */
  angle: 75,
  /** Subtle resting turn of the centre book so its left spine catches the light. */
  centreAngle: 10,
  /** Centre of the first neighbour from the centre of the flow. */
  neighbor: 0.78,
  /** Gap between consecutive side cards. */
  spacing: 0.32,
  /** Side cards stand this much nearer than the centre one. */
  sideZ: 0.13,
  /** CSS perspective distance. */
  perspective: 4.2,
  /** Book/album thickness (spine depth). */
  spine: 0.085,
  /** While stacked (collapsed), each card sits this much behind the previous. */
  stackDepth: 0.09,
} as const;

export type FlowPose = { x: number; z: number; rotateY: number; zIndex: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Resting place of a card `d` slots from the centre (fractional while gliding).
 * Leaving the centre, a card turns quickly and slides linearly, so it clears
 * the centre cover instead of cutting through it.
 */
export function flowPose(d: number): FlowPose {
  const a = Math.abs(d);
  const side = Math.sign(d);
  const t = Math.min(1, a);
  const turn = 1 - (1 - t) ** 2;
  const x = side * (a <= 1 ? FLOW.neighbor * t : FLOW.neighbor + (a - 1) * FLOW.spacing);
  // Left cards (d < 0) turn their face to the right (positive rotateY), right cards to the left.
  // The centre card keeps a slight turn so its left spine is visible, matching the reference.
  const rotateY = -side * FLOW.angle * turn + FLOW.centreAngle * (1 - turn);
  return { x, z: FLOW.sideZ * turn, rotateY: rotateY || 0, zIndex: Math.round(1000 - a * 10) };
}

/**
 * Opening progress (0 stacked → 1 in place) of one card, given the overall
 * `spread` (0 → 1). The centre card leads, flying from the artwork into the
 * flow; neighbours then fan out from behind it, nearest first. Run `spread`
 * backwards and the same timing puts them away: farthest first, centre last.
 */
export function cardProgress(spread: number, d: number) {
  const a = Math.abs(d);
  const near = Math.min(1, a);
  const start = a <= 1 ? 0.32 * a : 0.32 + 0.045 * Math.min(a - 1, 6);
  const duration = lerp(0.62, 0.41, near);
  const u = clamp01((spread - start) / duration);
  return lerp(easeInOutCubic(u), easeOutCubic(u), near);
}

/** Angle in (-180, 180], so a spinning cover unwinds the short way. */
export const shortAngle = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180;
