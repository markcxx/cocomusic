'use client';

import { motion } from 'framer-motion';
import { Compass, Download, HardDrive, Heart, History, House, Settings, TrendingUp, type LucideIcon } from 'lucide-react';
import { SidebarPlaylists } from '@/components/account/SidebarPlaylists';
import { BrandMark } from '@/components/common/BrandMark';
import { cn } from '@/lib/cn';
import { useNavigation, type Route } from './navigation';
import styles from './Sidebar.module.css';

/** Sidebar destinations are parameterless routes. */
type SimpleRoute = Exclude<Route['name'], 'playlist' | 'album' | 'artist' | 'search'>;
type NavItem = { id: SimpleRoute; label: string; icon: LucideIcon };

const libraryGroup: NavItem[] = [
  { id: 'home', label: '首页', icon: House },
  { id: 'discover', label: '发现音乐', icon: Compass },
  { id: 'charts', label: '排行榜', icon: TrendingUp },
];

const mineGroup: NavItem[] = [
  { id: 'liked', label: '我喜欢', icon: Heart },
  { id: 'recent', label: '最近播放', icon: History },
  { id: 'local', label: '本地音乐', icon: HardDrive },
  { id: 'downloads', label: '下载管理', icon: Download },
];

/** Shared pill that glides between whichever item is active. */
function ActivePill() {
  return <motion.span layoutId="sidebar-active" className={styles.activePill} transition={{ type: 'spring', stiffness: 520, damping: 40 }} aria-hidden />;
}

function NavButton({ item }: { item: NavItem }) {
  const { route, navigate } = useNavigation();
  const active = route.name === item.id;
  const Icon = item.icon;
  return (
    <button type="button" className={cn(styles.navItem, active && styles.active)} aria-current={active ? 'page' : undefined} onClick={() => navigate({ name: item.id } as Route)}>
      {active && <ActivePill />}
      <motion.span className={styles.icon} whileTap={{ scale: 0.88 }}>
        <Icon size={18} strokeWidth={1.4} aria-hidden />
      </motion.span>
      <span className={styles.label}>{item.label}</span>
    </button>
  );
}

export function Sidebar() {
  return (
    <aside className={styles.sidebar} aria-label="主导航">
      <div className={styles.brand}>
        <BrandMark />
      </div>

      <nav className={styles.scroll}>
        <section className={styles.group}>
          <h2 className={styles.groupLabel}>音乐馆</h2>
          <div className={styles.items}>{libraryGroup.map(item => <NavButton key={item.id} item={item} />)}</div>
        </section>

        <section className={styles.group}>
          <h2 className={styles.groupLabel}>我的音乐</h2>
          <div className={styles.items}>{mineGroup.map(item => <NavButton key={item.id} item={item} />)}</div>
        </section>

        <SidebarPlaylists />
      </nav>

      <div className={styles.footer}>
        <NavButton item={{ id: 'settings', label: '设置', icon: Settings }} />
      </div>
    </aside>
  );
}
