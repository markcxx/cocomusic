'use client';

import { motion } from 'framer-motion';
import { Compass, Download, HardDrive, Heart, History, House, PanelLeftClose, PanelLeftOpen, TrendingUp, type LucideIcon } from 'lucide-react';
import { SidebarPlaylists } from '@/components/account/SidebarPlaylists';
import { BrandMark } from '@/components/common/BrandMark';
import { cn } from '@/lib/cn';
import { useNavigation, type Route } from './navigation';
import { setSidebarCollapsed, useSidebarCollapsed } from './sidebar-state';
import styles from './Sidebar.module.css';

/** Sidebar destinations are parameterless routes. 设置 lives in the top bar only. */
type SimpleRoute = 'home' | 'discover' | 'charts' | 'liked' | 'recent' | 'local' | 'downloads';
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

function NavButton({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { route, navigate } = useNavigation();
  const active = route.name === item.id;
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={cn(styles.navItem, active && styles.active)}
      aria-current={active ? 'page' : undefined}
      aria-label={item.label}
      // Collapsed: the label is hidden, so the tooltip names the destination.
      data-tooltip={collapsed ? item.label : undefined}
      data-tooltip-placement="right"
      onClick={() => navigate({ name: item.id } as Route)}
    >
      {active && <ActivePill />}
      <motion.span className={styles.icon} whileTap={{ scale: 0.88 }}>
        <Icon size={18} strokeWidth={1.4} aria-hidden />
      </motion.span>
      <span className={styles.label} aria-hidden>{item.label}</span>
    </button>
  );
}

/**
 * Main navigation. Collapses to an icon rail (the shell animates the column
 * width; labels fade and clip inside it). State persists across launches.
 */
export function Sidebar() {
  const collapsed = useSidebarCollapsed();
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <aside className={cn(styles.sidebar, collapsed && styles.collapsed)} aria-label="主导航" data-collapsed={collapsed || undefined}>
      <div className={styles.brand}>
        <span className={styles.brandMark}><BrandMark /></span>
        <motion.button
          type="button"
          className={styles.toggle}
          onClick={() => setSidebarCollapsed(!collapsed)}
          aria-label={collapsed ? '展开导航栏' : '收起导航栏'}
          aria-expanded={!collapsed}
          data-tooltip={collapsed ? '展开导航栏' : '收起导航栏'}
          data-tooltip-placement="right"
          whileTap={{ scale: 0.88 }}
        >
          <ToggleIcon size={18} strokeWidth={1.4} />
        </motion.button>
      </div>

      <nav className={styles.scroll}>
        <section className={styles.group}>
          <h2 className={styles.groupLabel}><span>音乐馆</span></h2>
          <div className={styles.items}>{libraryGroup.map(item => <NavButton key={item.id} item={item} collapsed={collapsed} />)}</div>
        </section>

        <section className={styles.group}>
          <h2 className={styles.groupLabel}><span>我的音乐</span></h2>
          <div className={styles.items}>{mineGroup.map(item => <NavButton key={item.id} item={item} collapsed={collapsed} />)}</div>
        </section>

        <SidebarPlaylists collapsed={collapsed} />
      </nav>
    </aside>
  );
}
