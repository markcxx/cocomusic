'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { accountApi, type UserPlaylist, type UserProfile } from '@/lib/account-client';
import { useLatest } from '@/lib/use-latest';
import { toast } from '@/components/ui/toast';

type AccountState = {
  /** undefined while the stored session is being checked. */
  profile: UserProfile | null | undefined;
  playlists: UserPlaylist[];
  likedPlaylist?: UserPlaylist;
  loginOpen: boolean;
  openLogin: () => void;
  closeLogin: () => void;
  onLoggedIn: (profile: UserProfile) => void;
  logout: () => Promise<void>;
  /** Raw song id (platform id, no source prefix). */
  isLiked: (songId: string) => boolean;
  /** Optimistic toggle; reverts and toasts on failure. Opens login when logged out. */
  toggleLike: (songId: string) => Promise<void>;
  isSubscribed: (playlistId: string) => boolean;
  isOwnPlaylist: (playlistId: string) => boolean;
  /** Resolves true when the change went through. */
  toggleSubscribe: (playlist: { id: string; name: string }) => Promise<boolean>;
  createPlaylist: (name: string, privacy: 'public' | 'private') => Promise<UserPlaylist>;
  deletePlaylist: (id: string) => Promise<void>;
  renamePlaylist: (id: string, name: string) => Promise<void>;
  addToPlaylist: (playlistId: string, songIds: string[]) => Promise<void>;
  refreshPlaylists: () => Promise<void>;
};

const AccountContext = createContext<AccountState | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const [liked, setLiked] = useState<Set<string>>(() => new Set());
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([]);
  const [loginOpen, setLoginOpen] = useState(false);
  const profileRef = useLatest(profile);

  const loadLibrary = useCallback(async () => {
    const [likes, lists] = await Promise.allSettled([accountApi.likes(), accountApi.playlists()]);
    if (likes.status === 'fulfilled') setLiked(new Set(likes.value.ids));
    if (lists.status === 'fulfilled') setPlaylists(lists.value.playlists);
  }, []);

  useEffect(() => {
    accountApi.me()
      .then(({ profile: current }) => { setProfile(current); if (current) void loadLibrary(); })
      .catch(() => setProfile(null));
  }, [loadLibrary]);

  const requireLogin = useCallback(() => {
    if (profileRef.current) return true;
    setLoginOpen(true);
    return false;
  }, [profileRef]);

  const value = useMemo<AccountState>(() => ({
    profile,
    playlists,
    likedPlaylist: playlists.find(item => item.liked),
    loginOpen,
    openLogin: () => setLoginOpen(true),
    closeLogin: () => setLoginOpen(false),
    onLoggedIn: next => {
      setProfile(next);
      setLoginOpen(false);
      toast.success(`欢迎回来，${next.nickname}`);
      void loadLibrary();
    },
    logout: async () => {
      await accountApi.logout().catch(() => undefined);
      setProfile(null);
      setLiked(new Set());
      setPlaylists([]);
      toast.info('已退出登录');
    },
    isLiked: id => liked.has(id),
    toggleLike: async id => {
      if (!requireLogin()) return;
      const next = !liked.has(id);
      setLiked(previous => { const copy = new Set(previous); if (next) copy.add(id); else copy.delete(id); return copy; });
      try {
        await accountApi.like(id, next);
      } catch (error) {
        setLiked(previous => { const copy = new Set(previous); if (next) copy.delete(id); else copy.add(id); return copy; });
        toast.error(error instanceof Error ? error.message : '操作失败');
      }
    },
    isSubscribed: id => playlists.some(item => item.id === id && !item.own),
    isOwnPlaylist: id => playlists.some(item => item.id === id && item.own),
    toggleSubscribe: async playlist => {
      if (!requireLogin()) return false;
      const subscribed = playlists.some(item => item.id === playlist.id && !item.own);
      try {
        await accountApi.subscribe(playlist.id, !subscribed);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '操作失败');
        return false;
      }
      toast.success(subscribed ? '已取消收藏' : `已收藏「${playlist.name}」`);
      await accountApi.playlists().then(({ playlists: next }) => setPlaylists(next)).catch(() => undefined);
      return true;
    },
    createPlaylist: async (name, privacy) => {
      const { playlist } = await accountApi.createPlaylist(name, privacy);
      // New own playlists appear right after 我喜欢的音乐.
      setPlaylists(previous => {
        const ownEnd = previous.findIndex(item => !item.own);
        const at = ownEnd < 0 ? previous.length : ownEnd;
        return [...previous.slice(0, at), playlist, ...previous.slice(at)];
      });
      toast.success(`已创建歌单「${playlist.name}」`);
      return playlist;
    },
    deletePlaylist: async id => {
      await accountApi.deletePlaylist(id);
      setPlaylists(previous => previous.filter(item => item.id !== id));
      toast.info('歌单已删除');
    },
    renamePlaylist: async (id, name) => {
      await accountApi.renamePlaylist(id, name);
      setPlaylists(previous => previous.map(item => (item.id === id ? { ...item, name } : item)));
      toast.success('歌单已重命名');
    },
    addToPlaylist: async (playlistId, songIds) => {
      if (!requireLogin()) return;
      try {
        await accountApi.editTracks(playlistId, songIds, 'add');
        const target = playlists.find(item => item.id === playlistId);
        toast.success(`已添加 ${songIds.length} 首到「${target?.name ?? '歌单'}」`);
        setPlaylists(previous => previous.map(item => (item.id === playlistId ? { ...item, trackCount: (item.trackCount ?? 0) + songIds.length } : item)));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '添加失败');
      }
    },
    refreshPlaylists: async () => {
      const { playlists: next } = await accountApi.playlists();
      setPlaylists(next);
    },
  }), [profile, playlists, loginOpen, liked, loadLibrary, requireLogin]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error('AccountProvider is required');
  return value;
}
