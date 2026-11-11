'use client';

import { motion } from 'framer-motion';
import { Compass, Download, HardDrive, Heart, History, House, Menu, Mic2, PanelLeftClose, PanelLeftOpen, Settings, TrendingUp, type LucideIcon } from 'lucide-react';
import { SidebarPlaylists } from '@/components/account/SidebarPlaylists';
import { BrandMark } from '@/components/common/BrandMark';
import { SidebarLocalPlaylists } from '@/components/playlists/SidebarLocalPlaylists';
import { cn } from '@/lib/cn';
import { useNavigation, type Route } from './navigation';
import styles from './Sidebar.module.css';

/** Sidebar destinations are parameterless routes. Fluent pins settings to the footer. */
type SimpleRoute = 'home' | 'discover' | 'artists' | 'charts' | 'liked' | 'recent' | 'local' | 'downloads' | 'settings';
type NavItem = { id: SimpleRoute; label: string; icon: LucideIcon };

const libraryGroup: NavItem[] = [
  { id: 'home', label: '首页', icon: House },
  { id: 'discover', label: '发现音乐', icon: Compass },
  { id: 'artists', label: '歌手', icon: Mic2 },
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

function NavButton({ item, collapsed, onSelect }: { item: NavItem; collapsed: boolean; onSelect?: () => void }) {
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
      onClick={() => { navigate({ name: item.id } as Route); onSelect?.(); }}
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
export function Sidebar({ collapsed, onToggle, fluent = false, onSelect }: {
  collapsed: boolean; onToggle: () => void; fluent?: boolean; onSelect?: () => void;
}) {
  const ToggleIcon = fluent ? Menu : collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <aside className={cn(styles.sidebar, collapsed && styles.collapsed)} aria-label="主导航" data-collapsed={collapsed || undefined}>
      <div className={styles.brand}>
        <span className={styles.brandMark}><BrandMark /></span>
        <motion.button
          type="button"
          className={styles.toggle}
          onClick={onToggle}
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
          <div className={styles.items}>{libraryGroup.map(item => <NavButton key={item.id} item={item} collapsed={collapsed} onSelect={onSelect} />)}</div>
        </section>

        <section className={styles.group}>
          <h2 className={styles.groupLabel}><span>我的音乐</span></h2>
          <div className={styles.items}>{mineGroup.map(item => <NavButton key={item.id} item={item} collapsed={collapsed} onSelect={onSelect} />)}</div>
        </section>

        <SidebarPlaylists collapsed={collapsed} />
        <SidebarLocalPlaylists collapsed={collapsed} />
      </nav>
      {fluent && (
        <footer className={styles.footer}>
          <NavButton item={{ id: 'settings', label: '设置', icon: Settings }} collapsed={collapsed} onSelect={onSelect} />
        </footer>
      )}
    </aside>
  );
}
