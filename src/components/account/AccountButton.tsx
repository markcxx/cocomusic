'use client';

import { motion } from 'framer-motion';
import { ChevronDown, Heart, History, LogOut, UserRound } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigation } from '@/components/layout/navigation';
import { Menu } from '@/components/ui';
import { useAccount } from './account-store';
import styles from './AccountButton.module.css';

/** Top-bar avatar + nickname. Logged out: opens QR login. Logged in: account menu. */
export function AccountButton() {
  const { profile, openLogin, logout } = useAccount();
  const { navigate } = useNavigation();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const checking = profile === undefined;

  return (
    <>
      <motion.button
        ref={anchor}
        type="button"
        className={styles.account}
        data-open={open}
        whileTap={{ scale: 0.97 }}
        onClick={() => (profile ? setOpen(value => !value) : openLogin())}
        aria-label={profile ? `账号：${profile.nickname}` : '未登录，点击登录'}
        aria-haspopup={profile ? 'menu' : 'dialog'}
        aria-expanded={profile ? open : undefined}
        data-tooltip={profile ? profile.nickname : '点击登录'}
        data-tooltip-placement="bottom"
      >
        <span className={styles.avatar}>
          {profile?.avatar ? <img src={profile.avatar} alt="" referrerPolicy="no-referrer" /> : <UserRound size={16} strokeWidth={1.5} />}
        </span>
        <span className={styles.nickname}>{checking ? '…' : profile ? profile.nickname : '点击登录'}</span>
        {profile && (
          <motion.span className={styles.caret} animate={{ rotate: open ? 180 : 0 }}>
            <ChevronDown size={14} strokeWidth={1.5} />
          </motion.span>
        )}
      </motion.button>
      <Menu
        open={open}
        anchor={anchor}
        align="end"
        onClose={() => setOpen(false)}
        items={[
          { type: 'section', label: profile?.vipType ? '黑胶会员' : '网易云音乐' },
          { label: '我喜欢的音乐', icon: <Heart size={15} strokeWidth={1.5} />, onSelect: () => navigate({ name: 'liked' }) },
          { label: '最近播放', icon: <History size={15} strokeWidth={1.5} />, onSelect: () => navigate({ name: 'recent' }) },
          { type: 'divider' },
          { label: '退出登录', icon: <LogOut size={15} strokeWidth={1.5} />, danger: true, onSelect: () => void logout() },
        ]}
      />
    </>
  );
}
