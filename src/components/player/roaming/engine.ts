import * as THREE from 'three';
import { BeatTracker } from './beat';
import { Notes } from './notes';
import { seedOf } from './seed';
import { Director, type ShotPlan } from './director';
import { LyricLine, type FontSpec, type LyricLook } from './lyric-mesh';
import { buildPath, SPACING, textAnchor, textQuaternion, type Path } from './path';
import { planShots, type Mood } from './shots';
import { buildTimeline, framedStation, stationAt, type Station } from './timeline';
import type { LyricLine as SourceLine } from '@/server/music/types';

/**
 * 星河漫游: the scene, independent of React. The host feeds it the song
 * (lyrics, duration, id) and the clock each frame; it owns the renderer, the
 * camera director and the lyric meshes. The canvas is transparent: the
 * lyrics page's blurred artwork is the backdrop.
 */

export type EngineOptions = {
  font: FontSpec;
  /** Global lyric font scale (设置 › 歌词字号 / 18). */
  fontScale: number;
  mood: Mood;
  /** 0…1: how much lines vary in placement, tilt and size. */
  variety: number;
};

/** `accent` = sung text colour (CSS); `tint` = the artwork's "r, g, b" (music notes). */
export type SongInput = { id: string; lines: SourceLine[]; duration: number; accent: string; tint: string };

type Scene = {
  id: string;
  stations: Station[];
  path: Path;
  shots: ShotPlan[];
  lines: Map<number, LyricLine>;
  /** World group holding this song's lines (kept while it recedes after a change). */
  group: THREE.Group;
  /** Seconds left before the old scene is removed. */
  retire?: number;
};

/** Reference framing distance for fitting long lines. */
const REFERENCE_DISTANCE = 5.2;
const FOV = 52;

export class RoamingEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
  private readonly director: Director;
  private readonly notes = new Notes();
  private readonly beat = new BeatTracker();
  private current: Scene | null = null;
  private leaving: Scene[] = [];
  private readonly primary = new THREE.Color('#ffffff');
  private readonly secondary = new THREE.Color('#ffffff');
  private readonly accent = new THREE.Color('#ffffff');
  private readonly accentTarget = new THREE.Color('#ffffff');
  private options: EngineOptions;
  private flights = 0;
  private lastTime = 0;
  private lastFramed = -1;
  private cutNext = true;
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement, options: EngineOptions) {
    this.options = options;
    // Transparent, premultiplied: the blurred cover behind the canvas shows through.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.director = new Director(this.camera);
    this.scene.add(this.notes.mesh);
  }

  setOptions(options: EngineOptions) {
    const relayout = options.fontScale !== this.options.fontScale || options.variety !== this.options.variety || options.font.family !== this.options.font.family || options.font.weight !== this.options.font.weight || options.mood !== this.options.mood;
    this.options = options;
    if (relayout && this.current) this.rebuild(this.current, true);
  }

  resize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    // Narrow windows: widen the vertical FOV a little so lines still fit.
    this.camera.fov = this.camera.aspect < 1.2 ? FOV + (1.2 - this.camera.aspect) * 18 : FOV;
    this.camera.updateProjectionMatrix();
    if (this.current) this.rebuild(this.current, true);
  }

  /** Visible width at the reference distance, for fitting long lines. */
  private frameWidth() {
    const vertical = THREE.MathUtils.degToRad(this.camera.fov);
    return 2 * Math.tan(vertical / 2) * REFERENCE_DISTANCE * this.camera.aspect;
  }

  /**
   * New song, lyrics update, or loop. Same id + same lines: nothing. Same id
   * with new lines (late lyrics): rebuilt in place, no flight. New id: a
   * new scene placed away from the camera and a flight to it.
   */
  setSong(song: SongInput) {
    this.accentTarget.set(song.accent);
    this.notes.setTint(song.tint);
    const current = this.current;
    const key = song.lines.map(line => `${line.time}|${line.text}`).join('\n');
    if (current && current.id === song.id) {
      if ((current as Scene & { key?: string }).key === key) return;
      (current as Scene & { key?: string }).key = key;
      const stations = buildTimeline(song.lines, song.duration);
      current.stations = stations;
      this.rebuild(current, true);
      return;
    }
    const stations = buildTimeline(song.lines, song.duration);
    const seed = seedOf(song.id);
    const first = !current;
    let origin = new THREE.Vector3();
    let heading = 0;
    if (!first) {
      // Place the new scene ~46 units off in a direction that varies each time.
      this.flights += 1;
      const forward = this.camera.getWorldDirection(new THREE.Vector3());
      const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
      const up = right.clone().cross(forward).normalize();
      const turn = [[0, 0], [0.5, 0.12], [-0.45, -0.1], [0.2, 0.38], [-0.3, -0.32], [0.9, 0]][this.flights % 6];
      const direction = forward.clone().addScaledVector(right, turn[0]).addScaledVector(up, turn[1]).normalize();
      origin = this.camera.position.clone().addScaledVector(direction, 46);
      heading = Math.atan2(direction.x, -direction.z);
      current.retire = 4.5;
      this.leaving.push(current);
    }
    const scene: Scene & { key?: string } = { id: song.id, stations, path: buildPath(stations, seed, this.options.variety, origin, heading, Math.ceil((song.duration || 180) / 5)), shots: planShots(stations, seed, this.options.mood), lines: new Map(), group: new THREE.Group(), key };
    this.scene.add(scene.group);
    this.current = scene;
    if (first) this.cutNext = true;
    else this.director.flyTo(3.2);
    this.lastFramed = -1;
  }

  /** The same song restarted from its first line: fly back along the same path. */
  private loopBack() {
    this.director.flyTo(2.6);
  }

  private rebuild(scene: Scene, keepPath: boolean) {
    for (const line of scene.lines.values()) { scene.group.remove(line.group); line.dispose(); }
    scene.lines.clear();
    if (!keepPath) return;
    const seed = seedOf(scene.id);
    const origin = scene.path.origin;
    const first = scene.path.frames[0];
    const heading = first ? Math.atan2(first.forward.x, -first.forward.z) : 0;
    scene.path = buildPath(scene.stations, seed, this.options.variety, origin, heading, scene.path.frames.length);
    scene.shots = planShots(scene.stations, seed, this.options.mood);
  }

  private lineFor(scene: Scene, index: number) {
    let line = scene.lines.get(index);
    if (line) return line;
    const station = scene.stations[index];
    if (!station?.text.trim()) return null;
    const staging = scene.path.staging[Math.min(index, scene.path.staging.length - 1)];
    line = new LyricLine(station, this.options.font, staging.scale * this.options.fontScale, this.frameWidth());
    textAnchor(scene.path, index, line.group.position);
    textQuaternion(scene.path, index, line.group.quaternion);
    scene.group.add(line.group);
    scene.lines.set(index, line);
    return line;
  }

  /** Distance fade: lines grow out of the haze, and dissolve right in front of the lens. */
  private fade(position: THREE.Vector3) {
    const d = position.distanceTo(this.camera.position);
    const far = 1 - THREE.MathUtils.smoothstep(d, 32, 40);
    const near = THREE.MathUtils.smoothstep(d, 0.9, 2);
    return far * near;
  }

  /**
   * One frame. `time` is song time; `clock` is real seconds (drift keeps
   * breathing while paused); `bins` is this frame's analyser data (null when
   * paused or unreadable) for the notes' beat bounce.
   */
  frame(time: number, dt: number, clock: number, playing: boolean, bins: Uint8Array | null = null, sampleRate = 48000) {
    const scene = this.current;
    this.beat.update(playing ? bins : null, sampleRate, dt);
    // The sung colour glides to the new song's accent over ~1.5 s.
    this.accent.lerp(this.accentTarget, 1 - Math.exp(-dt / 0.5));

    if (scene) {
      // Loop restart: the song jumped back to its first line.
      if (this.lastTime > 20 && time < 3 && this.lastFramed > 2) this.loopBack();
      this.lastTime = time;
      const hasLyrics = scene.stations.length > 0;
      const framed = hasLyrics ? framedStation(scene.stations, time) : Math.max(0, Math.floor(time / 5));
      this.lastFramed = framed;
      const input = {
        stations: scene.stations, path: scene.path, shots: scene.shots, framed, time, dt, clock, playing,
        lag: { calm: 0.55, normal: 0.4, lively: 0.33 }[this.options.mood],
        lineWidth: (index: number) => scene.lines.get(index)?.width ?? 3,
      };
      if (this.cutNext) { this.lineFor(scene, framed); this.director.cut(input); this.cutNext = false; }
      else this.director.update(input);

      this.drawLines(scene, time, hasLyrics ? stationAt(scene.stations, time) : -1);
    }

    for (let i = this.leaving.length - 1; i >= 0; i -= 1) {
      const old = this.leaving[i];
      old.retire! -= dt;
      this.drawLeaving(old, Math.max(0, old.retire! / 4.5));
      if (old.retire! <= 0) {
        for (const line of old.lines.values()) line.dispose();
        this.scene.remove(old.group);
        this.leaving.splice(i, 1);
      }
    }

    this.notes.follow(this.camera.position, this.camera.getWorldDirection(new THREE.Vector3()));
    this.notes.update(clock, dt, this.beat.hop);
    this.renderer.render(this.scene, this.camera);
  }

  private look(): LyricLook {
    return { primary: this.primary, secondary: this.secondary, sung: this.accent };
  }

  /** Current line, ~2 past and ~3 ahead as quiet neighbours; everything else unloaded. */
  private drawLines(scene: Scene, time: number, sung: number) {
    const look = this.look();
    const framed = framedStation(scene.stations, time);
    const centre = sung >= 0 ? sung : framed;
    const ahead = [0.34, 0.16, 0.06];
    const behind = [0.3, 0.1];
    const keep = new Set<number>();
    for (let offset = -2; offset <= 3; offset += 1) {
      const index = centre + offset;
      if (index < 0 || index >= scene.stations.length) continue;
      const line = this.lineFor(scene, index);
      if (!line) continue;
      keep.add(index);
      const fade = this.fade(line.group.position);
      if (offset === 0 && sung >= 0 && time >= scene.stations[index].start) line.update(time, { kind: 'current' }, look, fade);
      else if (offset > 0 || (offset === 0 && sung < 0)) line.update(time, { kind: 'neighbour', alpha: ahead[Math.max(0, offset - 1)] ?? 0.06 }, look, fade);
      else line.update(time, { kind: 'neighbour', alpha: behind[-offset - 1] ?? 0.1 }, look, fade);
    }
    for (const [index, line] of scene.lines) {
      if (keep.has(index)) continue;
      scene.group.remove(line.group);
      line.dispose();
      scene.lines.delete(index);
    }
  }

  /** The scene being left behind: lines stay faintly lit and recede into the fog. */
  private drawLeaving(scene: Scene, life: number) {
    const look = this.look();
    let rank = 0;
    for (const line of [...scene.lines.values()].reverse()) {
      const alpha = [0.7, 0.45, 0.25][Math.min(2, rank)] * life;
      line.update(0, { kind: 'neighbour', alpha }, look, this.fade(line.group.position));
      rank += 1;
    }
  }

  /** Lyrics present? (the host shows a hint before the first line). */
  firstLineAt() {
    return this.current?.stations[0]?.start ?? Infinity;
  }

  dispose() {
    for (const scene of [this.current, ...this.leaving]) {
      if (!scene) continue;
      for (const line of scene.lines.values()) line.dispose();
    }
    this.notes.dispose();
    this.renderer.dispose();
  }
}

/** Distance between consecutive stations (exported for the virtual path). */
export { SPACING };
