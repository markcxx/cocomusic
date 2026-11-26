'use client';

import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';
import { Menu, toast, type MenuItem } from '@/components/ui';
import { settings, useSettings } from '@/lib/settings';
import { SOURCE_NAMES } from '@/server/music/ids';
import type { CatalogSource } from '@/server/music/types';
import styles from './PlatformPill.module.css';

/** Authentic vector brand emblems for each supported music platform. */
export function PlatformIcon({ source, size = 18 }: { source: CatalogSource; size?: number }) {
  const gradientId = useId();
  switch (source) {
    case 'netease':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={styles.brandSvg}>
          <rect width="24" height="24" rx="6" fill="#E60026" />
          <path
            d="M12.3 6.2c2.9 0 5.1 2.2 5.1 5.1 0 3.3-2.6 5.9-5.9 5.9-3.1 0-5.5-2.4-5.5-5.4 0-2.7 2-4.8 4.6-4.8 2.2 0 3.9 1.6 3.9 3.7 0 1.8-1.3 3.1-3 3.1-1.4 0-2.4-1-2.4-2.3 0-1.1.8-1.9 1.8-1.9.8 0 1.4.6 1.4 1.3"
            stroke="#fff"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path d="M13.2 5.2l1.6 1.2" stroke="#fff" strokeWidth="1.65" strokeLinecap="round" />
        </svg>
      );
    case 'qq':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={styles.brandSvg}>
          <rect width="24" height="24" rx="6" fill="#FECE00" />
          <path
            d="M14.8 6.3v7.6a3.3 3.3 0 1 1-1.9-3V7.9l3.8-.9v2.2l-1.9.4"
            stroke="#12B770"
            strokeWidth="2.05"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="11.4" cy="14.1" r="2.2" fill="#12B770" />
        </svg>
      );
    case 'kugou':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={styles.brandSvg}>
          <rect width="24" height="24" rx="6" fill="#0C8ED9" />
          <path
            d="M8.5 6.8v10.4M8.5 12.1l6.4-5.1M11.2 10.2l4.4 7"
            stroke="#fff"
            strokeWidth="2.15"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'kugou-lite':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={styles.brandSvg}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop stopColor="#35D0BA" />
              <stop offset="1" stopColor="#7C5CFA" />
            </linearGradient>
          </defs>
          <rect width="24" height="24" rx="6" fill={`url(#${gradientId})`} />
          <circle cx="12" cy="12" r="6.2" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.3" />
          <path
            d="M9.6 8.2v7.6M9.6 12l4.8-3.7M11.6 10.6l3.2 5.2"
            stroke="#fff"
            strokeWidth="1.95"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

const PLATFORMS: readonly CatalogSource[] = ['netease', 'qq', 'kugou', 'kugou-lite'];

/**
 * Top-bar platform switcher sitting right next to AccountButton. Uses the same
 * pill chrome as AccountButton and opens the app's native <Menu>.
 */
export function PlatformPill() {
  const current = useSettings().catalogSource;
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const items: MenuItem[] = [
    { type: 'section', label: '音乐平台' },
    ...PLATFORMS.map((id): MenuItem => ({
      label: SOURCE_NAMES[id],
      icon: <PlatformIcon source={id} size={17} />,
      selected: id === current,
      onSelect: () => {
        if (id === current) return;
        settings.set('catalogSource', id);
        toast.info(`已切换至${SOURCE_NAMES[id]}`);
      },
    })),
  ];

  return (
    <>
      <motion.button
        ref={anchor}
        type="button"
        className={styles.trigger}
        data-open={open}
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen(value => !value)}
        aria-label={`当前平台：${SOURCE_NAMES[current]}，点击切换`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-tooltip={open ? undefined : '切换音乐平台'}
        data-tooltip-placement="bottom"
      >
        <PlatformIcon source={current} size={20} />
        <span className={styles.label}>{SOURCE_NAMES[current]}</span>
        <motion.span className={styles.caret} animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronDown size={14} strokeWidth={1.5} />
        </motion.span>
      </motion.button>

      <Menu open={open} anchor={anchor} items={items} onClose={close} align="end" />
    </>
  );
}
