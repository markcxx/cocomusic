import * as THREE from 'three';
import { mulberry32 } from './seed';
import type { Station } from './timeline';

/**
 * The flight path: one frame (position + orthonormal basis) per station,
 * spaced along a forward-winding curve. Heading wanders left/right and the
 * pitch gently rises and falls through a sum of slow sines with seeded
 * phases, so every song gets its own but repeatable route. It never turns
 * back on itself: each step's heading stays within ±32° of the overall
 * direction, so passed lines are always behind the camera.
 *
 * Each station also gets its own "staging": an off-centre placement of the
 * text, its scale, roll and yaw, and an aim offset so the camera frames it
 * on a third rather than dead centre.
 */

export const SPACING = 8;

export type Frame = {
  position: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
};

export type Staging = {
  /** Where the text sits relative to the path point, in the frame's right/up. */
  offset: THREE.Vector2;
  scale: number;
  roll: number;
  yaw: number;
  /** Camera aims this far beside the text (right/up), for a thirds composition. */
  aim: THREE.Vector2;
};

export type Path = {
  frames: Frame[];
  staging: Staging[];
  /** The direction a new frame past the end would extend in. */
  origin: THREE.Vector3;
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Frame `i` of a path that starts at `origin` heading along `heading0`. */
function frameSeries(count: number, seed: number, origin: THREE.Vector3, baseHeading: number): Frame[] {
  const rng = mulberry32(seed);
  // Three yaw waves and two pitch waves of different periods (in stations).
  const yawWaves = [0, 1, 2].map(i => ({ period: [11, 23, 37][i] * (0.8 + rng() * 0.4), phase: rng() * Math.PI * 2, amp: [0.28, 0.18, 0.1][i] }));
  const pitchWaves = [0, 1].map(i => ({ period: [17, 41][i] * (0.8 + rng() * 0.4), phase: rng() * Math.PI * 2, amp: [0.18, 0.12][i] }));
  const sum = (waves: typeof yawWaves, t: number) => waves.reduce((s, w) => s + Math.sin((t / w.period) * Math.PI * 2 + w.phase) * w.amp, 0);

  const frames: Frame[] = [];
  const position = origin.clone();
  for (let i = 0; i < count; i += 1) {
    const yaw = baseHeading + THREE.MathUtils.clamp(sum(yawWaves, i), -0.56, 0.56);
    const pitch = THREE.MathUtils.clamp(sum(pitchWaves, i), -0.31, 0.31);
    const forward = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).normalize();
    const right = forward.clone().cross(WORLD_UP).normalize();
    const up = right.clone().cross(forward).normalize();
    frames.push({ position: position.clone(), forward, right, up });
    // Advance along the average of this and the next heading for a smooth curve.
    position.addScaledVector(forward, SPACING);
  }
  return frames;
}

/**
 * Off-centre placement that wanders smoothly from line to line: a random walk
 * pulled back to the centre, plus jitter. `variety` 0 → centred and level.
 */
function stagingSeries(stations: Station[], seed: number, variety: number): Staging[] {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  let x = 0;
  let y = 0;
  return stations.map((station, i) => {
    x = THREE.MathUtils.clamp(x * 0.55 + (rng() - 0.5) * 2.6, -1.8, 1.8);
    y = THREE.MathUtils.clamp(y * 0.5 + (rng() - 0.5) * 1.8, -1.2, 1.2);
    // Short lines may grow a little; very long ones never get bigger.
    const length = Array.from(station.text).length;
    const scale = THREE.MathUtils.lerp(0.82, 1.28, rng()) * (length > 22 ? 0.9 : 1);
    const roll = (rng() - 0.5) * 2 * THREE.MathUtils.degToRad(11);
    const yaw = (rng() - 0.5) * 2 * THREE.MathUtils.degToRad(9);
    // Aim on the side opposite the offset, which puts the text on a third.
    const aim = new THREE.Vector2(-Math.sign(x || (i % 2 ? 1 : -1)) * (0.4 + rng() * 0.7), (rng() - 0.5) * 0.6);
    return {
      offset: new THREE.Vector2(x * variety, y * variety),
      scale: THREE.MathUtils.lerp(1, scale, variety),
      roll: roll * variety,
      yaw: yaw * variety,
      aim: aim.multiplyScalar(variety),
    };
  });
}

/**
 * A path for `stations`, placed at `origin` heading `heading` (radians, 0 =
 * −Z). With no lyrics, `virtualCount` invisible stations still give the
 * camera somewhere to go.
 */
export function buildPath(stations: Station[], seed: number, variety: number, origin = new THREE.Vector3(), heading = 0, virtualCount = 0): Path {
  const count = Math.max(stations.length, virtualCount, 1) + 6;
  const frames = frameSeries(count, seed, origin, heading);
  const padded: Station[] = stations.length ? stations : Array.from({ length: count }, (_, index) => ({ index, text: '', start: index * 5, end: index * 5 + 5, next: index * 5 + 5, units: [], filler: false, chorus: index % 8 >= 4, sectionStart: index % 8 === 0, held: index % 3 === 0, staccato: false }));
  return { frames, staging: stagingSeries(padded, seed, variety), origin: origin.clone() };
}

/** Frame `i`, extended straight past the end if the path is shorter. */
export function frameAt(path: Path, i: number): Frame {
  const frames = path.frames;
  if (i < frames.length) return frames[Math.max(0, i)];
  const last = frames[frames.length - 1];
  return { ...last, position: last.position.clone().addScaledVector(last.forward, SPACING * (i - frames.length + 1)) };
}

/** World position of the text anchor for station `i`. */
export function textAnchor(path: Path, i: number, target = new THREE.Vector3()) {
  const frame = frameAt(path, i);
  const staging = path.staging[Math.min(i, path.staging.length - 1)];
  return target.copy(frame.position).addScaledVector(frame.right, staging.offset.x).addScaledVector(frame.up, staging.offset.y);
}

/** Orientation of the text plane for station `i`: facing back along the path, with roll and yaw. */
export function textQuaternion(path: Path, i: number, target = new THREE.Quaternion()) {
  const frame = frameAt(path, i);
  const staging = path.staging[Math.min(i, path.staging.length - 1)];
  // Text faces the approaching camera: its normal points back (−forward).
  const basis = new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.forward.clone().negate());
  target.setFromRotationMatrix(basis);
  const tweak = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, staging.yaw, staging.roll, 'YXZ'));
  return target.multiply(tweak);
}
