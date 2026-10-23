'use client';

import { MotionConfig } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import { AccountProvider } from '@/components/account/account-store';
import { LoginDialog } from '@/components/account/LoginDialog';
import { MiniPlayer } from '@/components/mini/MiniPlayer';
import { useMiniMode } from '@/components/mini/use-mini-mode';
import { LyricsDrawer } from '@/components/player/LyricsDrawer';
import { PlayerBar } from '@/components/player/PlayerBar';
import { PlayerProvider } from '@/components/player/player-store';
import { ScrollArea } from '@/components/scroll';
import { Toaster, TooltipLayer } from '@/components/ui';
import { NavigationProvider, useNavigation } from './navigation';
import { Sidebar } from './Sidebar';
import { useSidebarCollapsed } from './sidebar-state';
import { TopBar } from './TopBar';
import styles from './AppShell.module.css';

function useWindowMaterial() {
  useEffect(() => {
    // With OS acrylic/vibrancy the drawn backdrop fades back so the desktop shows through.
    document.documentElement.dataset.material = window.coco?.material ?? 'none';
    // macOS keeps native traffic lights in the top-left; layout reserves room for them.
    document.documentElement.dataset.platform = window.coco?.platform ?? 'web';
  }, []);
}

function ContentSheet({ children }: { children: ReactNode }) {
  const { rememberScroll } = useNavigation();
  return (
    <main className={`glass ${styles.sheet}`}>
      <ScrollArea id="content-sheet" className={styles.scroll} onScrollTop={rememberScroll}>{children}</ScrollArea>
    </main>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  useWindowMaterial();
  const collapsed = useSidebarCollapsed();
  const mini = useMiniMode();
  // Lets global CSS drop the window backdrop so the capsule's corners are see-through.
  useEffect(() => { document.documentElement.dataset.mini = mini ? 'true' : 'false'; }, [mini]);
  return (
    // reducedMotion="user" disables transform/layout animations when the OS asks for it.
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.8 }}>
      <NavigationProvider>
        <AccountProvider>
          <PlayerProvider>
            <div className="backdrop" aria-hidden />
            {/* The full UI stays mounted under the mini bar: playback and state carry over. */}
            <div className={`${styles.shell} ${collapsed ? styles.collapsed : ''}`} inert={mini} aria-hidden={mini || undefined} style={mini ? { visibility: 'hidden' } : undefined}>
              <div className={styles.sidebar}>
                <Sidebar />
              </div>
              <div className={styles.main}>
                <div className={styles.topBar}>
                  <TopBar />
                </div>
                <ContentSheet>{children}</ContentSheet>
              </div>
              <div className={styles.player}>
                <PlayerBar />
              </div>
            </div>
            {mini ? <MiniPlayer /> : <LyricsDrawer />}
            <LoginDialog />
            <Toaster />
            <TooltipLayer />
          </PlayerProvider>
        </AccountProvider>
      </NavigationProvider>
    </MotionConfig>
  );
}
