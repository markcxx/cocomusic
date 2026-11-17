'use client';

import { useEffect, useState } from 'react';
import { coverHue } from '@/components/common/Cover';
import { hslToRgb, rgbToHsl, rgbTriplet, type Rgb } from '@/lib/color';

/** A light, lively version of a colour, readable on the dark lyrics page. */
function brighten(rgb: Rgb) {
  const hsl = rgbToHsl(rgb);
  return rgbTriplet(hslToRgb({ h: hsl.h, s: Math.min(0.85, Math.max(0.35, hsl.s * 1.15)), l: Math.min(0.82, Math.max(0.68, hsl.l + 0.25)) }));
}

const fallback = (seed: string) => brighten(hslToRgb({ h: coverHue(seed), s: 0.6, l: 0.6 }));
const cache = new Map<string, string>();

/**
 * Dominant colour of the artwork as "r, g, b": saturated pixels weigh more, so
 * a mostly grey cover with a red logo comes out red. Needs a CORS-readable
 * image (the desktop app allows it); otherwise the seeded placeholder hue.
 */
function sample(src: string): Promise<string | null> {
  return new Promise(resolve => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';
    image.decoding = 'async';
    image.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(image, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let r = 0; let g = 0; let b = 0; let total = 0;
        for (let index = 0; index < data.length; index += 4) {
          const [pr, pg, pb] = [data[index], data[index + 1], data[index + 2]];
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          const weight = 0.05 + ((max - min) / 255) ** 2 * (max > 30 ? 1 : 0.1);
          r += pr * weight; g += pg * weight; b += pb * weight; total += weight;
        }
        resolve(total ? brighten({ r: r / total, g: g / total, b: b / total }) : null);
      } catch {
        // Tainted canvas (no CORS): fall back.
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export function useCoverTint(src: string | undefined, seed: string) {
  const [state, setState] = useState<{ src?: string; tint: string }>({ tint: fallback(seed) });
  useEffect(() => {
    if (!src) return;
    const hit = cache.get(src);
    if (hit) { const timer = setTimeout(() => setState({ src, tint: hit }), 0); return () => clearTimeout(timer); }
    let cancelled = false;
    void sample(src).then(tint => {
      if (cancelled || !tint) return;
      if (cache.size > 64) cache.delete(cache.keys().next().value!);
      cache.set(src, tint);
      setState({ src, tint });
    });
    return () => { cancelled = true; };
  }, [src]);
  return src && state.src === src ? state.tint : fallback(seed);
}

export type CoverPalette = readonly [string, string, string, string];

const paletteCache = new Map<string, CoverPalette>();

function fallbackPalette(seed: string): CoverPalette {
  const base = coverHue(seed);
  const pick = (offset: number, s: number, l: number) => rgbTriplet(hslToRgb({ h: (base + offset) % 360, s, l }));
  return [pick(0, 0.72, 0.52), pick(42, 0.68, 0.46), pick(195, 0.6, 0.44), pick(305, 0.64, 0.38)];
}

/** Richer colour for fluid blobs: keeps saturation high while avoiding pure white washout. */
function richFluid(rgb: Rgb, hueShift = 0) {
  const hsl = rgbToHsl(rgb);
  return rgbTriplet(hslToRgb({
    h: (hsl.h + hueShift + 360) % 360,
    s: Math.min(0.95, Math.max(0.55, hsl.s * 1.35)),
    l: Math.min(0.62, Math.max(0.38, hsl.l)),
  }));
}

function samplePalette(src: string): Promise<CoverPalette | null> {
  return new Promise(resolve => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';
    image.decoding = 'async';
    image.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(image, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const quads = [
          { r: 0, g: 0, b: 0, w: 0 },
          { r: 0, g: 0, b: 0, w: 0 },
          { r: 0, g: 0, b: 0, w: 0 },
          { r: 0, g: 0, b: 0, w: 0 },
        ];
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            const idx = (y * size + x) * 4;
            const [pr, pg, pb] = [data[idx], data[idx + 1], data[idx + 2]];
            const max = Math.max(pr, pg, pb);
            const min = Math.min(pr, pg, pb);
            const weight = 0.05 + ((max - min) / 255) ** 2 * (max > 30 ? 1 : 0.12);
            const q = quads[(y >= size / 2 ? 2 : 0) + (x >= size / 2 ? 1 : 0)];
            q.r += pr * weight; q.g += pg * weight; q.b += pb * weight; q.w += weight;
          }
        }
        const shifts = [0, 28, -36, 135];
        const colors = quads.map((q, i) => {
          const avg = q.w ? { r: q.r / q.w, g: q.g / q.w, b: q.b / q.w } : { r: 90, g: 78, b: 140 };
          return richFluid(avg, shifts[i]);
        });
        resolve([colors[0], colors[1], colors[2], colors[3]]);
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export function useCoverPalette(src: string | undefined, seed: string): CoverPalette {
  const [state, setState] = useState<{ src?: string; palette: CoverPalette }>(() => ({ palette: fallbackPalette(seed) }));
  useEffect(() => {
    if (!src) return;
    const hit = paletteCache.get(src);
    if (hit) { const timer = setTimeout(() => setState({ src, palette: hit }), 0); return () => clearTimeout(timer); }
    let cancelled = false;
    void samplePalette(src).then(palette => {
      if (cancelled || !palette) return;
      if (paletteCache.size > 64) paletteCache.delete(paletteCache.keys().next().value!);
      paletteCache.set(src, palette);
      setState({ src, palette });
    });
    return () => { cancelled = true; };
  }, [src]);
  return src && state.src === src ? state.palette : fallbackPalette(seed);
}
