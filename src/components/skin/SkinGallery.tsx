'use client';

import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';
import { surfacePalette } from '@/lib/color';
import { cn } from '@/lib/cn';
import { SKINS, type Skin } from '@/lib/skins';
import styles from './SkinGallery.module.css';

/** The skin's backdrop as the window would draw it: the same colour fields, derived from its theme colour. */
function previewVars(skin: Skin) {
  const tones = surfacePalette(skin.accent, skin.scheme);
  return {
    '--sk-a': tones['--backdrop-primary-rgb'],
    '--sk-b': tones['--backdrop-secondary-rgb'],
    '--sk-c': tones['--backdrop-tertiary-rgb'],
    '--sk-d': tones['--backdrop-quaternary-rgb'],
    '--sk-base': tones['--backdrop-base'],
    '--sk-accent': skin.accent,
  } as CSSProperties;
}

/** 皮肤: one tile per preset, drawn as a miniature window in its own colours. */
export function SkinGallery({ active, disabled, onPick }: { active: string | null; disabled?: boolean; onPick: (skin: Skin) => void }) {
  return (
    <div className={styles.grid} role="radiogroup" aria-label="皮肤">
      {SKINS.map(skin => {
        const selected = skin.id === active;
        return (
          <button key={skin.id} type="button" role="radio" aria-checked={selected} disabled={disabled} className={cn(styles.tile, selected && styles.on)} onClick={() => onPick(skin)}>
            <span className={cn(styles.preview, skin.scheme === 'dark' && styles.dark)} style={previewVars(skin)} aria-hidden>
              <span className={styles.window}>
                <i className={styles.rail} />
                <i className={styles.sheet}><b /><b /></i>
                <i className={styles.bar} />
              </span>
              {selected && <span className={styles.check}><Check size={11} strokeWidth={2.6} /></span>}
            </span>
            <span className={styles.label}>{skin.label}</span>
          </button>
        );
      })}
    </div>
  );
}
