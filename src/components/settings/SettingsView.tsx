'use client';

import { AppWindow, CircleArrowUp, Disc3, Download, HardDrive, Info, Keyboard, Mic2, Palette, PictureInPicture2, Play, Type } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { sectionScrollTop } from '@/components/scroll/wheel-motion';
import { Page, useScrollArea } from '@/components/scroll';
import { useFluentStyle } from './ApplyAppearance';
import { cn } from '@/lib/cn';
import { AboutSection } from './sections/AboutSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { CatalogSection } from './sections/CatalogSection';
import { DesktopLyricsSection } from './sections/DesktopLyricsSection';
import { DownloadsSection } from './sections/DownloadsSection';
import { LibrarySection } from './sections/LibrarySection';
import { LyricsSection } from './sections/LyricsSection';
import { MiniSection } from './sections/MiniSection';
import { PlaybackSection } from './sections/PlaybackSection';
import { ShortcutsSection } from './sections/ShortcutsSection';
import { SystemSection } from './sections/SystemSection';
import { TaskbarLyricsSection } from './sections/TaskbarLyricsSection';
import { UpdatesSection } from './sections/UpdatesSection';
import { isDesktop, isMac, useAppSettings } from './shared';
import styles from './Settings.module.css';

const SECTIONS = [
  { id: 'catalog', label: '曲库', icon: Disc3 },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'playback', label: '播放', icon: Play },
  { id: 'lyrics', label: '歌词页', icon: Type },
  { id: 'desktop-lyrics', label: '桌面歌词', icon: Mic2 },
  { id: 'taskbar-lyrics', label: '任务栏歌词', icon: Mic2 },
  { id: 'mini', label: '迷你模式', icon: PictureInPicture2 },
  { id: 'downloads', label: '下载', icon: Download },
  { id: 'library', label: '本地与数据', icon: HardDrive },
  { id: 'shortcuts', label: '快捷键', icon: Keyboard },
  { id: 'system', label: '系统', icon: AppWindow },
  { id: 'updates', label: '更新', icon: CircleArrowUp },
  { id: 'about', label: '关于', icon: Info },
] as const;

/** 设置: every option here is applied live; sections jump from the sticky index on the left. */
export function SettingsView() {
  const { element, scrollTo } = useScrollArea();
  const app = useAppSettings();
  const fluent = useFluentStyle();
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  const clicking = useRef(0);

  // Highlight the section in view (scroll-spy), unless a click just scrolled us there.
  useEffect(() => {
    const root = element();
    if (fluent || !root) return;
    const onScroll = () => {
      if (performance.now() - clicking.current < 600) return;
      const sections = [...root.querySelectorAll<HTMLElement>('[data-settings-section]')];
      const top = root.getBoundingClientRect().top + 120;
      let current = sections[0]?.dataset.settingsSection;
      for (const section of sections) if (section.getBoundingClientRect().top <= top) current = section.dataset.settingsSection;
      // At the very bottom, the last section wins even if it is short.
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 4) current = sections.at(-1)?.dataset.settingsSection;
      if (current) setActive(current);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [element, fluent]);

  const jump = (id: string, at: number) => {
    const root = element();
    const target = root?.querySelector<HTMLElement>(`#settings-${id}`);
    if (!root || !target) return;
    clicking.current = at;
    setActive(id);
    scrollTo(sectionScrollTop(root, target), true);
  };

  return (
    <Page className={styles.page}>
      <header className={styles.hero}>
        <h1>设置</h1>
        {!fluent && <p>所有设置即时生效，并保存在本机。</p>}
      </header>

      <div className={styles.layout}>
        {!fluent && <nav className={styles.index} aria-label="设置分类">
          {SECTIONS.filter(section => section.id !== 'taskbar-lyrics' || app.result?.info.platform === 'win32').map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={cn(styles.indexItem, active === id && styles.indexActive)} onClick={() => jump(id, performance.now())} aria-current={active === id ? 'true' : undefined}>
              <Icon size={15} strokeWidth={1.6} />{label}
            </button>
          ))}
        </nav>}

        <div className={styles.sections}>
          <CatalogSection />
          <AppearanceSection app={app} />
          <PlaybackSection />
          <LyricsSection />
          <DesktopLyricsSection />
          {/* Windows only: transparent lyrics docked in the taskbar. */}
          {isDesktop() && !isMac() && app.result?.info.platform === 'win32' && <TaskbarLyricsSection />}
          <MiniSection />
          <DownloadsSection />
          <LibrarySection app={app} />
          <ShortcutsSection app={app} />
          <SystemSection app={app} />
          <UpdatesSection />
          <AboutSection app={app} />
        </div>
      </div>
    </Page>
  );
}

