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
