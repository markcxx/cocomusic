'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import { persistentStorage } from '@/lib/persistent-storage';
import { Sidebar } from './Sidebar';
import { useNavigation } from './navigation';
import styles from './FluentNavigation.module.css';

const wide = '(min-width: 1008px)';
const medium = '(min-width: 641px)';
function subscribe(resize: () => void) {
  const queries = [wide, medium].map(query => window.matchMedia(query));
  queries.forEach(query => query.addEventListener('change', resize));
  return () => queries.forEach(query => query.removeEventListener('change', resize));
}
function mode() {
  return matchMedia(wide).matches ? 'expanded' : matchMedia(medium).matches ? 'compact' : 'minimal';
}

export function FluentNavigation() {
  const display = useSyncExternalStore(subscribe, mode, () => 'expanded' as const);
  return <Pane key={display} display={display} />;
}

function Pane({ display }: { display: ReturnType<typeof mode> }) {
  const { entryKey } = useNavigation();
  const pane = useRef<HTMLDivElement>(null);
  const inline = display === 'expanded';
  const [compact, setCompact] = useState(() => inline && persistentStorage.getItem('coco:fluent-nav-compact') === '1');
  const [openEntry, setOpenEntry] = useState<string>();
  if (openEntry !== undefined && openEntry !== entryKey) setOpenEntry(undefined);
  const overlay = !inline && openEntry === entryKey;
  const collapsed = inline ? compact : !overlay;
  const close = () => {
    setOpenEntry(undefined);
    pane.current?.querySelector<HTMLButtonElement>('button[aria-expanded]')?.focus();
  };
  const toggle = () => {
    if (!inline) { setOpenEntry(overlay ? undefined : entryKey); return; }
    setCompact(!compact);
    persistentStorage.setItem('coco:fluent-nav-compact', compact ? '0' : '1');
  };

  return (
    <div className={styles.slot} data-display={display} data-collapsed={collapsed} data-overlay={overlay}>
      {overlay && <div className={styles.dismiss} onPointerDown={close} aria-hidden />}
      <div className={styles.pane} ref={pane}
        onBlur={event => { if (overlay && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpenEntry(undefined); }}
        onKeyDown={event => { if (overlay && event.key === 'Escape') { event.stopPropagation(); close(); } }}>
        <Sidebar fluent collapsed={collapsed} onToggle={toggle} onSelect={overlay ? close : undefined} />
      </div>
    </div>
  );
}
