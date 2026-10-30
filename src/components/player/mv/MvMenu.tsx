'use client';
import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, Menu } from '@/components/ui';
import styles from './MvVideoPlayer.module.css';

export function MvMenu({ label, value, options, onChange, disabled, portalContainer }: {
  label: string; value: string; options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void; disabled?: boolean; portalContainer?: HTMLElement | null;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  return <>
    <span ref={anchor} className={styles.menuAnchor}>
      <Button variant="ghost" className={styles.menuButton} disabled={disabled} title={label} onClick={() => setOpen(v => !v)}>
        {options.find(option => option.value === value)?.label ?? label}<ChevronDown size={12} />
      </Button>
    </span>
    <Menu open={open} anchor={anchor} align="end" placement="top" portalContainer={portalContainer} onClose={() => setOpen(false)} items={[
      { type: 'section', label },
      ...options.map(option => ({ label: option.label, selected: option.value === value, onSelect: () => onChange(option.value) })),
    ]} />
  </>;
}
