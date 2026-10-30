import * as THREE from 'three';
import type { Station } from './timeline';
import { unitProgress } from './timeline';

/**
 * One lyric line as 3D typography: the line set once on a canvas (so it is
 * kerned like normal text), shown on one quad facing back along the path.
 *
 * The karaoke is a quiet effect: unsung text is dim, and a soft-edged wipe
 * brightens it left to right as it is sung. As each character finishes, a
 * faint copy of it lifts off from the same spot — rising about half a line,
 * growing a little and fading out — while the character itself stays put.
 * The copies are one instanced mesh cut from the same texture, one quad per
 * character, so a whole line of them costs a single draw.
 */

/** Text height in world units before the per-line scale. */
export const LINE_HEIGHT = 0.62;
/** Fraction of the frame width a line may fill at the reference distance. */
const MAX_FRAME_SHARE = 0.72;
/** Below this fraction of the nominal size, a long line stops shrinking. */
const MIN_SCALE = 0.28;
const FONT_PX = 160;
const PAD = 40;

export type FontSpec = { family: string; weight: number };

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Afterimage: one quad per character, cut from the line texture by its u range. */
const GHOST_VERT = /* glsl */ `
attribute vec2 aSpan;     // u0, u1 of the character in the texture
attribute vec2 aPlace;    // centre x, width (local units)
attribute vec3 aMotion;   // lift, scale, alpha
uniform float uHeight;    // quad height (local units)
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec2 corner = position.xy + 0.5;
  vUv = vec2(mix(aSpan.x, aSpan.y, corner.x), corner.y);
  float w = aPlace.y * aMotion.y;
  float h = uHeight * aMotion.y;
  vec3 p = vec3(aPlace.x + (corner.x - 0.5) * w, (corner.y - 0.5) * h + aMotion.x, 0.0);
  vAlpha = aMotion.z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const GHOST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uFade;
varying vec2 vUv;
varying float vAlpha;
void main() {
  float a = texture2D(uMap, vUv).a * vAlpha * uFade;
  if (a < 0.003) discard;
  // Additive: the copy reads as light lifting off the word.
  gl_FragColor = vec4(uColor * a, a);
}`;

/** How long an afterimage lives, how far it rises (× line height) and how much it grows. */
const GHOST_LIFE = 1.1;
const GHOST_RISE = 0.5;
const GHOST_GROW = 0.3;
const GHOST_ALPHA = 0.55;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform vec3 uBase;
uniform vec3 uSung;
uniform float uBaseAlpha;
uniform float uSungAlpha;
uniform float uWipe;      // 0…1 across the ink, in texture u
uniform float uSoft;      // width of the wipe's soft edge, in u
uniform float uFade;
varying vec2 vUv;
void main() {
  float ink = texture2D(uMap, vUv).a;
  if (ink < 0.003) discard;
  float sung = 1.0 - smoothstep(uWipe - uSoft, uWipe + uSoft, vUv.x);
  vec3 color = mix(uBase, uSung, sung);
  float alpha = mix(uBaseAlpha, uSungAlpha, sung) * ink * uFade;
  gl_FragColor = vec4(color, alpha);
}`;

type Atlas = { texture: THREE.CanvasTexture; width: number; height: number; inkLeft: number; inkRight: number; /** Prefix advance (px) per character offset. */ advance: (offset: number) => number };

function makeAtlas(station: Station, font: FontSpec): Atlas {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const fontCss = `${font.weight} ${FONT_PX}px ${font.family}`;
  ctx.font = fontCss;
  const text = station.text;
  const lineWidth = Math.ceil(ctx.measureText(text).width);
  canvas.width = Math.min(8192, lineWidth + PAD * 2);
  canvas.height = Math.ceil(FONT_PX * 1.45) + PAD * 2;
  ctx.font = fontCss;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, PAD, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  const measure = (offset: number) => ctx.measureText(text.slice(0, offset)).width;
  return { texture, width: canvas.width, height: canvas.height, inkLeft: PAD, inkRight: PAD + lineWidth, advance: measure };
}

export type LyricLook = {
  /** Sung text colour. */
  sung: THREE.Color;
  primary: THREE.Color;
  secondary: THREE.Color;
};

export type LineRole = { kind: 'current' } | { kind: 'neighbour'; alpha: number };

/**
 * A line placed in the world. `group` carries the anchor position and the
 * text-plane orientation; the director only moves the camera.
 */
export class LyricLine {
  readonly group = new THREE.Group();
  readonly station: Station;
  /** World-units width of the line (after fitting). */
  readonly width: number;
  private readonly atlas: Atlas;
  private readonly material: THREE.ShaderMaterial;
  private readonly mesh: THREE.Mesh;
  private readonly ghost: THREE.InstancedMesh;
  private readonly ghostMaterial: THREE.ShaderMaterial;
  private readonly ghostMotion: THREE.InstancedBufferAttribute;
  /** Wipe position (texture u) at the end of each unit, for interpolation. */
  private readonly unitU: Array<{ start: number; end: number; u0: number; u1: number }>;

  /** `frameWidth` = visible width at the reference camera distance (lines are fitted against it). */
  constructor(station: Station, font: FontSpec, baseScale: number, frameWidth: number) {
    this.station = station;
    this.atlas = makeAtlas(station, font);
    const { width, height, inkLeft, inkRight } = this.atlas;
    const pxToWorld = LINE_HEIGHT / FONT_PX;
    const natural = (inkRight - inkLeft) * pxToWorld * baseScale;
    const fit = Math.max(MIN_SCALE, Math.min(1, (frameWidth * MAX_FRAME_SHARE) / Math.max(0.001, natural)));
    this.width = natural * fit;
    this.unitU = station.units.map(unit => ({
      start: unit.start,
      end: unit.end,
      u0: (inkLeft + this.atlas.advance(unit.offset)) / width,
      u1: (inkLeft + this.atlas.advance(unit.offset + unit.text.length)) / width,
    }));

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      uniforms: {
        uMap: { value: this.atlas.texture },
        uBase: { value: new THREE.Color() }, uSung: { value: new THREE.Color() },
        uBaseAlpha: { value: 0.4 }, uSungAlpha: { value: 1 },
        uWipe: { value: 0 }, uSoft: { value: (FONT_PX * 0.35) / width }, uFade: { value: 1 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width * pxToWorld, height * pxToWorld), this.material);
    this.mesh.renderOrder = 10;

    // Afterimages: one instance per character, placed in the same local space as the text.
    const count = Math.max(1, this.unitU.length);
    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.getAttribute('position'));
    const spans = new Float32Array(count * 2);
    const places = new Float32Array(count * 2);
    const centre = (inkLeft + inkRight) / 2;
    this.unitU.forEach((unit, i) => {
      spans.set([unit.u0, unit.u1], i * 2);
      places.set([((unit.u0 + unit.u1) / 2 * width - centre) * pxToWorld, (unit.u1 - unit.u0) * width * pxToWorld], i * 2);
    });
    this.ghostMotion = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.ghostMotion.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aSpan', new THREE.InstancedBufferAttribute(spans, 2));
    geometry.setAttribute('aPlace', new THREE.InstancedBufferAttribute(places, 2));
    geometry.setAttribute('aMotion', this.ghostMotion);
    this.ghostMaterial = new THREE.ShaderMaterial({
      vertexShader: GHOST_VERT,
      fragmentShader: GHOST_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uMap: { value: this.atlas.texture }, uHeight: { value: height * pxToWorld }, uColor: { value: new THREE.Color() }, uFade: { value: 1 } },
    });
    this.ghost = new THREE.InstancedMesh(geometry, this.ghostMaterial, count);
    this.ghost.frustumCulled = false;
    this.ghost.renderOrder = 11;
    this.ghost.visible = false;

    // Centre the ink (not the padded canvas) on the anchor; the ghost quads are already ink-centred.
    this.mesh.position.x = ((width / 2) - centre) * pxToWorld;
    const holder = new THREE.Group();
    holder.scale.setScalar(baseScale * fit);
    holder.add(this.mesh, this.ghost);
    this.group.add(holder);
  }

  /** Lift, scale and alpha of every character's afterimage at `time`. */
  private updateGhosts(time: number) {
    const motion = this.ghostMotion;
    let any = false;
    this.unitU.forEach((unit, i) => {
      const age = time - unit.end;
      if (age < 0 || age > GHOST_LIFE) { motion.setXYZ(i, 0, 1, 0); return; }
      any = true;
      const k = age / GHOST_LIFE;
      // Eases out of the character, then drifts slowly as it fades.
      const eased = 1 - (1 - k) ** 3;
      motion.setXYZ(i, eased * LINE_HEIGHT * GHOST_RISE, 1 + eased * GHOST_GROW, GHOST_ALPHA * (1 - k) ** 1.5 * Math.min(1, age / 0.08));
    });
    motion.needsUpdate = true;
    this.ghost.visible = any;
  }

  /** Wipe position (texture u) at `time`: inside the unit being sung, eased by its progress. */
  private wipeAt(time: number) {
    const units = this.unitU;
    if (!units.length) return 1;
    if (time <= units[0].start) return units[0].u0;
    for (const unit of units) {
      if (time < unit.end) {
        const p = unitProgress({ start: unit.start, end: unit.end, offset: 0, text: '' }, time);
        return unit.u0 + (unit.u1 - unit.u0) * p;
      }
    }
    return 1.2;
  }

  update(time: number, role: LineRole, look: LyricLook, fade: number) {
    const u = this.material.uniforms;
    u.uFade.value = fade;
    if (role.kind === 'current') {
      (u.uBase.value as THREE.Color).copy(look.primary);
      (u.uSung.value as THREE.Color).copy(look.sung);
      u.uBaseAlpha.value = 0.42;
      u.uSungAlpha.value = 1;
      u.uWipe.value = this.wipeAt(time);
      (this.ghostMaterial.uniforms.uColor.value as THREE.Color).copy(look.sung);
      this.ghostMaterial.uniforms.uFade.value = fade;
      this.updateGhosts(time);
    } else {
      this.ghost.visible = false;
      (u.uBase.value as THREE.Color).copy(look.secondary);
      (u.uSung.value as THREE.Color).copy(look.secondary);
      u.uBaseAlpha.value = role.alpha;
      u.uSungAlpha.value = role.alpha;
      u.uWipe.value = 0;
    }
  }

  dispose() {
    this.atlas.texture.dispose();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.ghost.geometry.dispose();
    this.ghostMaterial.dispose();
  }
}
