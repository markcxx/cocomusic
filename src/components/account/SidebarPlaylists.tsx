'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, HeartOff, Link2, Lock, MoreHorizontal, PencilLine, Play, Plus, Trash2 } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { Cover } from '@/components/common/Cover';
import { useNavigation } from '@/components/layout/navigation';
import { usePlayer } from '@/components/player/player-store';
import { Menu, toast, type MenuItem } from '@/components/ui';
import type { UserPlaylist } from '@/lib/account-client';
import { catalogApi } from '@/lib/catalog-client';
import { cn } from '@/lib/cn';
import { toTrack } from '@/lib/to-track';
import { useAccount } from './account-store';
import { CreatePlaylistDialog } from './CreatePlaylistDialog';
import { DeletePlaylistDialog, RenamePlaylistDialog } from './PlaylistDialogs';
import styles from './SidebarPlaylists.module.css';

type MenuState = { playlist: UserPlaylist; anchor: HTMLElement; align: 'start' | 'end' };

/** Row actions shared by the hover "更多" button and the context menu. */
function usePlaylistActions(onRename: (playlist: UserPlaylist) => void, onDelete: (playlist: UserPlaylist) => void) {
  const player = usePlayer();
  const { toggleSubscribe } = useAccount();

  const playAll = async (playlist: UserPlaylist) => {
    try {
      const detail = await catalogApi.playlist(playlist.id, 0, 200);
      const queue = detail.tracks.map(toTrack);
      if (!queue[0]) { toast.info('歌单里还没有歌曲'); return; }
      player.play(queue[0], queue);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '歌单加载失败');
    }
  };

  const copyLink = async (playlist: UserPlaylist) => {
    try {
      await navigator.clipboard.writeText(`https://music.163.com/#/playlist?id=${playlist.id}`);
      toast.success('链接已复制');
    } catch {
      toast.error('复制失败');
    }
  };

  return (playlist: UserPlaylist): MenuItem[] => [
    { label: '播放歌单', icon: <Play size={15} strokeWidth={1.5} />, onSelect: () => void playAll(playlist) },
    { label: '复制链接', icon: <Link2 size={15} strokeWidth={1.5} />, onSelect: () => void copyLink(playlist) },
    { type: 'divider' },
    ...(playlist.own
      ? [
          { label: '重命名', icon: <PencilLine size={15} strokeWidth={1.5} />, onSelect: () => onRename(playlist) },
          { label: '删除歌单', icon: <Trash2 size={15} strokeWidth={1.5} />, danger: true, onSelect: () => onDelete(playlist) },
        ] satisfies MenuItem[]
      : [{ label: '取消收藏', icon: <HeartOff size={15} strokeWidth={1.5} />, danger: true, onSelect: () => void toggleSubscribe(playlist) }] satisfies MenuItem[]),
  ];
}

function Group({ title, items, action, onRename, onDelete, collapsed, defaultOpen = true }: {
  title: string;
  items: UserPlaylist[];
  action?: React.ReactNode;
  onRename: (playlist: UserPlaylist) => void;
  onDelete: (playlist: UserPlaylist) => void;
  /** Icon rail: covers only, names in tooltips. Groups stay open. */
  collapsed: boolean;
  defaultOpen?: boolean;
}) {
  const { route, navigate } = useNavigation();
  const [openState, setOpen] = useState(defaultOpen);
  const open = collapsed || openState;
  const [menu, setMenu] = useState<MenuState | null>(null);
  const actionsFor = usePlaylistActions(onRename, onDelete);

  const onContext = (event: MouseEvent<HTMLElement>, playlist: UserPlaylist) => {
    event.preventDefault();
    setMenu({ playlist, anchor: event.currentTarget, align: 'start' });
  };
  const onMore = (event: MouseEvent<HTMLButtonElement>, playlist: UserPlaylist) => {
    event.stopPropagation();
    const anchor = event.currentTarget;
    setMenu(current => (current?.anchor === anchor ? null : { playlist, anchor, align: 'start' }));
  };

  return (
    <section className={cn(styles.group, collapsed && styles.collapsed)}>
      <h2 className={styles.header}>
        <button type="button" className={styles.toggle} onClick={() => setOpen(value => !value)} aria-expanded={open}>
          {title}
          <span className={styles.count}>{items.length}</span>
          <motion.span className={styles.chevron} animate={{ rotate: open ? 0 : -90 }}>
            <ChevronDown size={13} strokeWidth={1.6} />
          </motion.span>
        </button>
        {action}
      </h2>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className={styles.items} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}>
            {items.map(playlist => {
              const active = route.name === 'playlist' && route.id === playlist.id;
              const menuOpen = menu?.playlist.id === playlist.id;
              return (
                // Row wrapper holds two sibling buttons (a button cannot contain another).
                <motion.div key={playlist.id} layout="position" className={cn(styles.row, active && styles.active, menuOpen && styles.menuOpen)} onContextMenu={event => onContext(event, playlist)}>
                  <button
                    type="button"
                    className={styles.item}
                    onClick={() => navigate({ name: 'playlist', id: playlist.id, title: playlist.name })}
                    data-tooltip={playlist.name}
                    data-tooltip-placement="right"
                    // Expanded: only when the name is cut off. Rail: always (no label shown).
                    data-tooltip-overflow={collapsed ? undefined : ''}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Cover seed={`${playlist.source}:${playlist.id}`} src={playlist.cover} size={28} radius={6} className={styles.cover} />
                    <span className={styles.label} data-tooltip-clip>{playlist.name}</span>
                    {playlist.privacy === 'private' && <Lock size={11} strokeWidth={1.8} className={styles.lock} aria-label="隐私歌单" />}
                  </button>
                  <button
                    type="button"
                    className={styles.more}
                    onClick={event => onMore(event, playlist)}
                    aria-label={`「${playlist.name}」更多操作`}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    data-tooltip="更多操作"
                  >
                    <MoreHorizontal size={16} strokeWidth={1.6} />
                  </button>
                </motion.div>
              );
            })}
            {!items.length && <p className={styles.empty}>暂无歌单</p>}
          </motion.div>
        )}
      </AnimatePresence>
      <Menu open={Boolean(menu)} anchor={menu?.anchor ?? null} align={menu?.align} onClose={() => setMenu(null)} items={menu ? actionsFor(menu.playlist) : []} />
    </section>
  );
}

/** 我的歌单 / 收藏的歌单 from the logged-in account; prompts login otherwise. */
export function SidebarPlaylists({ collapsed = false }: { collapsed?: boolean }) {
  const { profile, playlists, openLogin } = useAccount();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<UserPlaylist | null>(null);
  const [deleting, setDeleting] = useState<UserPlaylist | null>(null);
  const { route, navigate } = useNavigation();

  // 我喜欢的音乐 lives under 我喜欢 in the nav, so it is not repeated here.
  const own = playlists.filter(item => item.own && !item.liked);
  const subscribed = playlists.filter(item => !item.own);

  const create = (
    <motion.button
      type="button"
      className={styles.action}
      aria-label="新建歌单"
      data-tooltip="新建歌单"
      onClick={() => (profile ? setCreating(true) : openLogin())}
      initial="rest"
      whileHover="hover"
      whileTap="tap"
    >
      <motion.span className={styles.actionIcon} variants={{ rest: { rotate: 0 }, hover: { rotate: 90 }, tap: { scale: 0.85 } }}>
        <Plus size={15} strokeWidth={1.5} />
      </motion.span>
    </motion.button>
  );

  if (!profile) {
    return (
      <section className={cn(styles.group, collapsed && styles.collapsed)}>
        <h2 className={styles.header}><span className={styles.toggle}>我的歌单</span>{create}</h2>
        <button type="button" className={styles.loginHint} onClick={openLogin} disabled={profile === undefined}>
          登录后同步你的歌单
        </button>
      </section>
    );
  }

  return (
    <>
      <Group title="创建的歌单" items={own} action={create} onRename={setRenaming} onDelete={setDeleting} collapsed={collapsed} />
      {subscribed.length > 0 && <Group title="收藏的歌单" items={subscribed} onRename={setRenaming} onDelete={setDeleting} collapsed={collapsed} />}
      <CreatePlaylistDialog open={creating} onClose={() => setCreating(false)} onCreated={playlist => navigate({ name: 'playlist', id: playlist.id, title: playlist.name })} />
      <RenamePlaylistDialog playlist={renaming} onClose={() => setRenaming(null)} />
      <DeletePlaylistDialog
        playlist={deleting}
        onClose={() => setDeleting(null)}
        // Leave the page of a playlist that no longer exists.
        onDeleted={id => { if (route.name === 'playlist' && route.id === id) navigate({ name: 'home' }); }}
      />
    </>
  );
}
