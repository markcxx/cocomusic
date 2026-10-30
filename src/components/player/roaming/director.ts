import * as THREE from 'three';
import { frameAt, textAnchor, textQuaternion, type Path } from './path';
import { ALIGN, NEUTRAL, shotPose, type Pose, type ShotName } from './shots';
import { readPosition, type Station } from './timeline';

/**
 * The camera operator.
 *
 * Each frame it works out where the camera *wants* to be — the current
 * line's shot, played at the line's progress, around the point being sung —
 * and then reaches it through critically damped springs (no snap, no
 * overshoot). On top come a faint hand-held drift, an optional "square up
 * to read" alignment while a line is fresh, a slow return to neutral when a
 * line is held for a long time, a hard cut for big seeks, and a long arcing
 * flight when the scene changes song.
 */

export type ShotPlan = { name: ShotName; side: number; amplitude: number };

/** Critically damped spring towards a target (smooth-damp), per component. */
class Damped {
  readonly value: THREE.Vector3;
  private readonly velocity = new THREE.Vector3();
  constructor(initial: THREE.Vector3) { this.value = initial.clone(); }
  step(target: THREE.Vector3, smoothTime: number, dt: number) {
    const omega = 2 / Math.max(0.0001, smoothTime);
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = this.value.clone().sub(target);
    const temp = this.velocity.clone().addScaledVector(change, omega).multiplyScalar(dt);
    this.velocity.sub(temp.clone().multiplyScalar(omega)).multiplyScalar(exp);
    this.value.copy(target).add(change.add(temp).multiplyScalar(exp));
    return this.value;
  }
  jump(to: THREE.Vector3) { this.value.copy(to); this.velocity.set(0, 0, 0); }
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

export type DirectorInput = {
  stations: Station[];
  path: Path;
  shots: ShotPlan[];
  /** Station the camera frames (filler skipped). */
  framed: number;
  /** Song time (seconds). */
  time: number;
  /** Real seconds since the last frame. */
  dt: number;
  /** Real seconds elapsed (for drift; keeps moving while paused). */
  clock: number;
  playing: boolean;
  /** Follow lag in seconds (mood × speed setting). */
  lag: number;
  /** Width of a line in world units, by station (for the word truck). */
  lineWidth: (index: number) => number;
};

type Flight = {
  from: THREE.Vector3;
  fromLook: THREE.Vector3;
  started: number;
  duration: number;
  /** Sideways bow direction and its sign (world). */
  bow: THREE.Vector3;
  bank: number;
};

export class Director {
  readonly camera: THREE.PerspectiveCamera;
  private body: Damped;
  private look: Damped;
  private readonly roll = { value: 0, velocity: 0 };
  private flight: Flight | null = null;
  private lastFramed = -1;
  /** Song time at which the framed line stopped being sung (for the long-hold settle). */
  private heldSince = Infinity;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.body = new Damped(camera.position);
    this.look = new Damped(new THREE.Vector3(0, 0, -5));
  }

  /** Desired camera body and aim for a moment of the song. */
  private target(input: DirectorInput) {
    const { stations, path, shots, framed, time } = input;
    const station = stations[framed];
    const frame = frameAt(path, framed);
    const shot = shots[framed] ?? { name: 'hold' as ShotName, side: 1, amplitude: 1 };
    const span = station ? Math.max(0.6, station.end - station.start) : 5;
    const t = station ? easeInOut(Math.min(1, Math.max(0, (time - station.start) / span))) : 0.5;
    let pose: Pose = shotPose(shot.name, t, shot.side, shot.amplitude);

    // Long hold after the line ends: ease every extreme back to neutral over ~5 s.
    const settle = station && time > station.end + 3 ? smooth((time - station.end - 3) / 5) : 0;
    if (settle > 0) pose = blendPose(pose, NEUTRAL, settle);

    // Read point: the sung position on the line, softly limited on long lines.
    const anchor = textAnchor(path, framed);
    const quat = textQuaternion(path, framed);
    const lineRight = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
    const lineUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
    const width = input.lineWidth(framed);
    const progress = station ? readPosition(station, time) : 0.5;
    const reach = Math.tanh((width * 0.5) / 3.2) * 3.2; // soft limit, no hard stop
    const truck = (progress - 0.5) * 2 * reach * 0.5 * (1 - settle);
    const read = anchor.clone().addScaledVector(lineRight, truck);

    const staging = path.staging[Math.min(framed, path.staging.length - 1)];
    const aim = read.clone()
      .addScaledVector(frame.right, (staging.aim.x * (1 - settle)) + pose.aimX)
      .addScaledVector(frame.up, (staging.aim.y * (1 - settle)) + pose.aimY);

    // Body: back along the text's normal (towards the approaching camera), then orbit around its up.
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
    const offset = normal.multiplyScalar(pose.back)
      .addScaledVector(lineRight, pose.x)
      .addScaledVector(lineUp, pose.y)
      .applyAxisAngle(lineUp, pose.orbit);
    const body = read.clone().add(offset);
    return { body, aim, quat, shot: shot.name, station };
  }

  /** Start the long flight to a new scene (song change or loop restart). */
  flyTo(duration = 3.2) {
    this.flight = {
      from: this.body.value.clone(),
      fromLook: this.look.value.clone(),
      started: -1,
      duration,
      bow: new THREE.Vector3(),
      bank: Math.random() < 0.5 ? -1 : 1,
    };
  }

  /** Cut straight to the current target (first frame, big seek). */
  cut(input: DirectorInput) {
    const goal = this.target(input);
    this.body.jump(goal.body);
    this.look.jump(goal.aim);
    this.roll.value = 0;
    this.roll.velocity = 0;
    this.flight = null;
    this.apply(goal.body, goal.aim, 0, null, 0);
  }

  update(input: DirectorInput) {
    const goal = this.target(input);
    const { dt, clock } = input;

    // Big jump (seek several lines away): cut instead of flying across the scene.
    if (!this.flight && goal.body.distanceTo(this.body.value) > 24) { this.cut(input); return; }

    if (input.framed !== this.lastFramed) {
      this.lastFramed = input.framed;
      this.heldSince = Infinity;
    }
    if (goal.station && input.time > goal.station.end) this.heldSince = Math.min(this.heldSince, goal.station.end);

    let body = goal.body;
    let aim = goal.aim;
    let lag = input.lag;
    let bankRoll = 0;

    if (this.flight) {
      const flight = this.flight;
      if (flight.started < 0) {
        flight.started = clock;
        // Bow sideways, perpendicular to the travel, plus a slight lift.
        const travel = goal.body.clone().sub(flight.from);
        flight.bow = travel.clone().cross(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(flight.bank);
        if (!Number.isFinite(flight.bow.x)) flight.bow.set(1, 0, 0);
      }
      const k = Math.min(1, (clock - flight.started) / flight.duration);
      const e = easeInOut(k);
      const distance = goal.body.distanceTo(flight.from);
      const arc = Math.sin(Math.PI * e) * distance * 0.16;
      body = flight.from.clone().lerp(goal.body, e).addScaledVector(flight.bow, arc).add(new THREE.Vector3(0, arc * 0.35, 0));
      // The aim sweeps sideways mid-flight, then settles on the new line.
      aim = flight.fromLook.clone().lerp(goal.aim, smooth(e * 1.15)).addScaledVector(flight.bow, Math.sin(Math.PI * e) * distance * 0.08);
      bankRoll = Math.sin(Math.PI * e) * THREE.MathUtils.degToRad(8) * flight.bank;
      // Lazy at first, back to the normal follow speed by the end.
      lag = THREE.MathUtils.lerp(1.1, input.lag, e);
      if (k >= 1) this.flight = null;
    }

    // Faint hand-held drift: slow layered sway, bob and push (never zero, never fast).
    const drift = new THREE.Vector3(
      Math.sin(clock * 0.21) * 0.16 + Math.sin(clock * 0.067 + 1.3) * 0.12,
      Math.sin(clock * 0.17 + 0.6) * 0.1 + Math.sin(clock * 0.051) * 0.08,
      Math.sin(clock * 0.13 + 2.1) * 0.14,
    );
    const frame = frameAt(input.path, input.framed);
    const worldDrift = new THREE.Vector3()
      .addScaledVector(frame.right, drift.x).addScaledVector(frame.up, drift.y).addScaledVector(frame.forward, drift.z);

    // Paused: settle on the current target and hold (drift still breathes).
    const smoothTime = input.playing ? lag : Math.max(lag, 0.8);
    const position = this.body.step(body.add(worldDrift), smoothTime, dt);
    const lookAt = this.look.step(aim, smoothTime * 0.9, dt);

    // Square up to read: from ~0.6 s before a line until ~0.35 s in, release over ~1 s after it ends.
    const station = goal.station;
    let align = 0;
    if (station) {
      const into = input.time - (station.start - 0.6);
      const after = input.time - station.end;
      const rise = smooth(into / 0.95);
      const fall = after > 0 ? 1 - smooth(after / 1) : 1;
      align = rise * fall * ALIGN[goal.shot];
    }
    this.apply(position, lookAt, align, goal.quat, bankRoll, dt);
  }

  /**
   * Orient the camera: look at the aim with the world horizon level, then
   * blend part of the way towards the text plane's own orientation (so a
   * rolled line reads near-level), then add any banking — all through a
   * damped roll so turns read as deliberate pans, never cuts.
   */
  private apply(position: THREE.Vector3, aim: THREE.Vector3, align: number, textQuat: THREE.Quaternion | null, bank: number, dt = 0) {
    const camera = this.camera;
    camera.position.copy(position);
    camera.up.set(0, 1, 0);
    camera.lookAt(aim);
    let rollTarget = bank;
    if (textQuat && align > 0) {
      // The text's roll relative to the camera's current view, as an angle.
      const textUp = new THREE.Vector3(0, 1, 0).applyQuaternion(textQuat);
      const viewForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const projected = textUp.clone().addScaledVector(viewForward, -textUp.dot(viewForward)).normalize();
      const angle = Math.atan2(camUp.clone().cross(projected).dot(viewForward), camUp.dot(projected));
      rollTarget += -angle * align;
    }
    if (dt > 0) {
      // Spring on the roll angle (critically damped).
      const omega = 2 / 0.45;
      const acc = -omega * omega * (this.roll.value - rollTarget) - 2 * omega * this.roll.velocity;
      this.roll.velocity += acc * dt;
      this.roll.value += this.roll.velocity * dt;
    } else {
      this.roll.value = rollTarget;
    }
    camera.rotateZ(this.roll.value);
  }
}

function blendPose(a: Pose, b: Pose, t: number): Pose {
  const mix = (x: number, y: number) => x + (y - x) * t;
  return { x: mix(a.x, b.x), y: mix(a.y, b.y), back: mix(a.back, b.back), orbit: mix(a.orbit, b.orbit), aimX: mix(a.aimX, b.aimX), aimY: mix(a.aimY, b.aimY) };
}
