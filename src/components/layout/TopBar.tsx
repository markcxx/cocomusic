'use client';

import { ChevronLeft, ChevronRight, CircleArrowUp, PictureInPicture2, Settings } from 'lucide-react';
import { AccountButton } from '@/components/account/AccountButton';
import { SearchBox } from '@/components/search/SearchBox';
import { updateDialog, useUpdateState } from '@/components/updates/update-store';
import { IconButton } from '@/components/ui';
import { useNavigation } from './navigation';
import { useFluentStyle } from '@/components/settings/ApplyAppearance';
import { SkinDialog } from '@/components/skin/SkinDialog';
import { WindowControls } from './WindowControls';
import styles from './TopBar.module.css';

export function TopBar() {
  const { back, forward, canBack, canForward, navigate } = useNavigation();
  const fluent = useFluentStyle();
  // A new version stays one click away, but a skipped one does not nag.
  const updateState = useUpdateState();
  const update = updateState?.update && updateState.update.version !== updateState.skipped ? updateState.update : null;

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
        <SkinDialog />
        <IconButton label="迷你模式" iconHover={{ scale: 0.9, y: 1 }} onClick={() => window.coco?.window.toggleMini()}>
          <PictureInPicture2 size={18} strokeWidth={1.4} />
        </IconButton>
        {update && (
          <IconButton label={`新版本 ${update.version}`} iconHover={{ y: -2 }} active onClick={() => updateDialog.show('update')}>
            <CircleArrowUp size={18} strokeWidth={1.4} />
          </IconButton>
        )}
        {!fluent && <IconButton label="设置" iconHover={{ rotate: 90 }} onClick={() => navigate({ name: 'settings' })}>
          <Settings size={18} strokeWidth={1.4} />
        </IconButton>}
        <WindowControls />
      </div>
    </header>
  );
}
