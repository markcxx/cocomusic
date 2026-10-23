'use client';

import { ChevronLeft, ChevronRight, PictureInPicture2, Palette, Settings } from 'lucide-react';
import { AccountButton } from '@/components/account/AccountButton';
import { SearchBox } from '@/components/search/SearchBox';
import { IconButton } from '@/components/ui';
import { useNavigation } from './navigation';
import { WindowControls } from './WindowControls';
import styles from './TopBar.module.css';

export function TopBar() {
  const { back, forward, canBack, canForward, navigate } = useNavigation();

  return (
    <header className={styles.topBar}>
      <div className={styles.history}>
        <IconButton label="后退" onClick={back} disabled={!canBack} iconHover={{ x: -2 }}>
          <ChevronLeft size={20} strokeWidth={1.4} />
        </IconButton>
        <IconButton label="前进" onClick={forward} disabled={!canForward} iconHover={{ x: 2 }}>
          <ChevronRight size={20} strokeWidth={1.4} />
        </IconButton>
      </div>

      <SearchBox />

      <div className={styles.actions}>
        <AccountButton />
        <span className={styles.divider} aria-hidden />
        <IconButton label="换肤" iconHover={{ rotate: -14, scale: 1.1 }}>
          <Palette size={18} strokeWidth={1.4} />
        </IconButton>
        <IconButton label="迷你模式" iconHover={{ scale: 0.9, y: 1 }} onClick={() => window.coco?.window.toggleMini()}>
          <PictureInPicture2 size={18} strokeWidth={1.4} />
        </IconButton>
        <IconButton label="设置" iconHover={{ rotate: 90 }} onClick={() => navigate({ name: 'settings' })}>
          <Settings size={18} strokeWidth={1.4} />
        </IconButton>
        <WindowControls />
      </div>
    </header>
  );
}
