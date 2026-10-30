import * as THREE from 'three';
import { mulberry32 } from './seed';

/**
 * Floating music notes in the space around the path (♪ ♫ ♩ ♬ and a few
 * clefs/rests), drawn as soft white glyphs tinted from the artwork.
 *
 * They hang at different depths beside the flight path — never in the
 * central lane where the lyrics are — each slowly rising, swaying and
 * turning a little as if carried by air. They fade in out of the distance
 * and out before the lens, and are recycled ahead of the camera. On a beat
 * the nearer ones give a small bounce.
 *
 * All notes share one glyph atlas and one instanced quad mesh, so the whole
 * field is a single draw call.
 */

const GLYPHS = ['♪', '♫', '♩', '♬', '♪', '♫', '𝄞', '♭'];
const COUNT = 26;
const AHEAD = 30;
const BEHIND = 4;
/** Empty lane around the path so notes never sit on the lyrics. */
const LANE = 5;
const SPREAD = 5.5;
const CELL = 128;

function makeAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * GLYPHS.length;
  canvas.height = CELL;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  GLYPHS.forEach((glyph, i) => {
    ctx.font = `${glyph === '𝄞' ? 96 : 104}px "Apple Symbols", "Segoe UI Symbol", "Noto Music", "Noto Sans Symbols 2", serif`;
    // A soft halo under each glyph so it reads as light, not flat ink.
    ctx.shadowColor = 'rgba(255,255,255,0.75)';
    ctx.shadowBlur = 14;
    ctx.fillText(glyph, CELL * i + CELL / 2, CELL / 2 + 4);
    ctx.shadowBlur = 0;
    ctx.fillText(glyph, CELL * i + CELL / 2, CELL / 2 + 4);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

const VERT = /* glsl */ `
attribute vec3 aCenter;
attribute vec4 aShape;   // size, glyph index, seed, rise speed
uniform float uTime;
uniform float uHop;
uniform float uGlyphs;
uniform vec3 uCamera;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main() {
  float size = aShape.x, glyph = aShape.y, seed = aShape.z, rise = aShape.w;
  // Slow rise with a sway; wraps every few metres so a note never drifts away.
  vec3 c = aCenter;
  c.y += mod(uTime * rise + seed * 7.0, 8.0) - 4.0;
  c.x += sin(uTime * (0.35 + seed * 0.3) + seed * 30.0) * 0.45;
  c.z += cos(uTime * (0.27 + seed * 0.2) + seed * 19.0) * 0.3;
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float depth = -mv.z;
  // Nearer notes bounce a little on the beat.
  float bounce = uHop * (1.0 - smoothstep(6.0, 20.0, depth)) * 0.6;
  // Camera-facing quad with a gentle individual tilt.
  float tilt = sin(uTime * (0.4 + seed * 0.5) + seed * 11.0) * 0.28;
  vec2 corner = position.xy;
  corner = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt)) * corner;
  mv.xy += corner * size;
  mv.y += bounce;
  gl_Position = projectionMatrix * mv;
  vUv = vec2((position.x + 0.5 + glyph) / uGlyphs, position.y + 0.5);
  float far = 1.0 - smoothstep(20.0, 30.0, depth);
  float near = smoothstep(2.0, 5.5, depth);
  // The vertical wrap fades too, so a note never pops at the top or bottom.
  float wrap = mod(uTime * rise + seed * 7.0, 8.0) / 8.0;
  float cycle = smoothstep(0.0, 0.18, wrap) * (1.0 - smoothstep(0.82, 1.0, wrap));
  vAlpha = far * near * cycle;
  vSeed = seed;
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform vec3 uTint;
uniform float uOpacity;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main() {
  float ink = texture2D(uMap, vUv).a;
  float a = ink * vAlpha * uOpacity * (0.45 + 0.55 * fract(vSeed * 5.7));
  if (a < 0.003) discard;
  vec3 color = mix(uTint, vec3(1.0), 0.35 + 0.3 * fract(vSeed * 9.1));
  gl_FragColor = vec4(color, a);
}`;

export class Notes {
  readonly mesh: THREE.InstancedMesh;
  private readonly geometry = new THREE.InstancedBufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly atlas = makeAtlas();
  private readonly centers = new Float32Array(COUNT * 3);
  private readonly centerAttr: THREE.InstancedBufferAttribute;
  private readonly rng = mulberry32(0x7a7e);
  private readonly targetTint = new THREE.Color('#bcd0ff');
  private seeded = false;

  constructor() {
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geometry.index = quad.index;
    this.geometry.setAttribute('position', quad.getAttribute('position'));
    const shape = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT; i += 1) {
      // World size 2–4.5 units, like a set-piece beside the path rather than dust.
      shape.set([2 + this.rng() ** 1.5 * 2.5, Math.floor(this.rng() * GLYPHS.length), this.rng(), 0.12 + this.rng() * 0.22], i * 4);
    }
    this.centerAttr = new THREE.InstancedBufferAttribute(this.centers, 3);
    this.geometry.setAttribute('aCenter', this.centerAttr);
    this.geometry.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape, 4));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uMap: { value: this.atlas }, uTime: { value: 0 }, uHop: { value: 0 }, uGlyphs: { value: GLYPHS.length },
        uCamera: { value: new THREE.Vector3() }, uOpacity: { value: 0.75 }, uTint: { value: new THREE.Color('#bcd0ff') },
      },
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, COUNT);
    this.mesh.frustumCulled = false;
    // Behind the lyrics (which draw at renderOrder 10).
    this.mesh.renderOrder = 1;
  }

  private place(index: number, origin: THREE.Vector3, forward: THREE.Vector3, along: number) {
    const side = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const up = side.clone().cross(forward).normalize();
    // Mostly to the left and right, fewer above and below the lyrics.
    const angle = (this.rng() < 0.5 ? 0 : Math.PI) + (this.rng() - 0.5) * 1.6;
    const radius = LANE + this.rng() ** 0.8 * SPREAD;
    const p = origin.clone()
      .addScaledVector(forward, along)
      .addScaledVector(side, Math.cos(angle) * radius)
      .addScaledVector(up, Math.sin(angle) * radius * 0.7);
    this.centers.set([p.x, p.y, p.z], index * 3);
  }

  /** Fill the field around the camera the first time, then recycle notes it has passed. */
  follow(camera: THREE.Vector3, forward: THREE.Vector3) {
    let moved = false;
    if (!this.seeded) {
      for (let i = 0; i < COUNT; i += 1) this.place(i, camera, forward, -BEHIND + this.rng() * (AHEAD + BEHIND));
      this.seeded = true;
      moved = true;
    } else {
      const scratch = new THREE.Vector3();
      for (let i = 0; i < COUNT; i += 1) {
        scratch.fromArray(this.centers, i * 3).sub(camera);
        if (scratch.dot(forward) < -BEHIND || scratch.length() > AHEAD + SPREAD + 10) {
          this.place(i, camera, forward, AHEAD * (0.6 + this.rng() * 0.4));
          moved = true;
        }
      }
    }
    if (moved) this.centerAttr.needsUpdate = true;
    (this.material.uniforms.uCamera.value as THREE.Vector3).copy(camera);
  }

  /** `tint` = "r, g, b" from the artwork. */
  setTint(tint: string) {
    const [r, g, b] = tint.split(',').map(value => Number(value) / 255);
    if ([r, g, b].some(value => !Number.isFinite(value))) return;
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(r, g, b).getHSL(hsl);
    // Lift dark covers so the notes still read as light.
    this.targetTint.setHSL(hsl.h, Math.min(0.75, Math.max(0.3, hsl.s)), Math.max(0.68, hsl.l));
  }

  update(time: number, dt: number, hop: number) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uHop.value = hop;
    (u.uTint.value as THREE.Color).lerp(this.targetTint, 1 - Math.exp(-dt / 0.5));
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.atlas.dispose();
  }
}
