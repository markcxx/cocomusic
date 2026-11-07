'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Lock, MoreHorizontal, Plus } from 'lucide-react';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { Cover } from '@/components/common/Cover';
import { Menu, type MenuItem } from '@/components/ui';
import { cn } from '@/lib/cn';
import styles from './SidebarPlaylists.module.css';

/** One sidebar playlist row, whatever kind of playlist it stands for. */
export type SidebarRow = { id: string; name: string; seed: string; cover?: string; locked?: boolean };

type MenuState = { row: SidebarRow; anchor: HTMLElement };

/** Header action (新建歌单 …): the plus turns on hover. */
export function GroupAddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <motion.button type="button" className={styles.action} aria-label={label} data-tooltip={label} onClick={onClick} initial="rest" whileHover="hover" whileTap="tap">
      <motion.span className={styles.actionIcon} variants={{ rest: { rotate: 0 }, hover: { rotate: 90 }, tap: { scale: 0.85 } }}>
        <Plus size={15} strokeWidth={1.5} />
      </motion.span>
    </motion.button>
  );
}

/** Group heading with no rows below it (e.g. 我的歌单 before login); `children` fill the space. */
export function SidebarGroupShell({ title, action, collapsed, children }: { title: string; action?: ReactNode; collapsed: boolean; children: ReactNode }) {
  return (
    <section className={cn(styles.group, collapsed && styles.collapsed)}>
      <h2 className={styles.header}><span className={styles.toggle}>{title}</span>{action}</h2>
      {children}
    </section>
  );
}

/** Hint button inside an empty group (登录后同步你的歌单 …). */
export function SidebarHint({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button type="button" className={styles.loginHint} onClick={onClick} disabled={disabled}>{children}</button>;
}

/**
 * Collapsible sidebar list of playlists with a hover "更多" button and a
 * context menu per row. In the icon rail (`collapsed`) only covers show,
 * names move to tooltips and the group stays open.
 */
export function SidebarPlaylistGroup({ title, rows, action, collapsed, isActive, onOpen, menuFor, emptyText = '暂无歌单', defaultOpen = true }: {
  title: string;
  rows: SidebarRow[];
  action?: ReactNode;
  collapsed: boolean;
  isActive: (row: SidebarRow) => boolean;
  onOpen: (row: SidebarRow) => void;
  menuFor: (row: SidebarRow) => MenuItem[];
  emptyText?: string;
  defaultOpen?: boolean;
}) {
  const [openState, setOpen] = useState(defaultOpen);
  const open = collapsed || openState;
  const [menu, setMenu] = useState<MenuState | null>(null);

  const onContext = (event: MouseEvent<HTMLElement>, row: SidebarRow) => {
    event.preventDefault();
    setMenu({ row, anchor: event.currentTarget });
  };
  const onMore = (event: MouseEvent<HTMLButtonElement>, row: SidebarRow) => {
    event.stopPropagation();
    const anchor = event.currentTarget;
    setMenu(current => (current?.anchor === anchor ? null : { row, anchor }));
  };

  return (
    <section className={cn(styles.group, collapsed && styles.collapsed)}>
      <h2 className={styles.header}>
        <button type="button" className={styles.toggle} onClick={() => setOpen(value => !value)} aria-expanded={open}>
          {title}
          <span className={styles.count}>{rows.length}</span>
          <motion.span className={styles.chevron} animate={{ rotate: open ? 0 : -90 }}>
            <ChevronDown size={13} strokeWidth={1.6} />
          </motion.span>
        </button>
        {action}
      </h2>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className={styles.items} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}>
            {rows.map(row => {
              const active = isActive(row);
              const menuOpen = menu?.row.id === row.id;
              return (
                // Row wrapper holds two sibling buttons (a button cannot contain another).
                <motion.div key={row.id} layout="position" className={cn(styles.row, active && styles.active, menuOpen && styles.menuOpen)} onContextMenu={event => onContext(event, row)}>
                  <button
                    type="button"
                    className={styles.item}
                    onClick={() => onOpen(row)}
                    data-tooltip={row.name}
                    data-tooltip-placement="right"
                    // Expanded: only when the name is cut off. Rail: always (no label shown).
                    data-tooltip-overflow={collapsed ? undefined : ''}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Cover seed={row.seed} src={row.cover} size={28} radius={6} className={styles.cover} />
                    <span className={styles.label} data-tooltip-clip>{row.name}</span>
                    {row.locked && <Lock size={11} strokeWidth={1.8} className={styles.lock} aria-label="隐私歌单" />}
                  </button>
                  <button
                    type="button"
                    className={styles.more}
                    onClick={event => onMore(event, row)}
                    aria-label={`「${row.name}」更多操作`}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    data-tooltip="更多操作"
                  >
                    <MoreHorizontal size={16} strokeWidth={1.6} />
                  </button>
                </motion.div>
              );
            })}
            {!rows.length && <p className={styles.empty}>{emptyText}</p>}
          </motion.div>
        )}
      </AnimatePresence>
      <Menu open={Boolean(menu)} anchor={menu?.anchor ?? null} align="start" onClose={() => setMenu(null)} items={menu ? menuFor(menu.row) : []} />
    </section>
  );
}
