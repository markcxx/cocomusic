'use client';

import { motion } from 'framer-motion';
import { ChevronDown, UserRound } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { AccountCard } from './AccountCard';
import { useAccount } from './account-store';
import styles from './AccountButton.module.css';

/** Top-bar avatar + nickname. Logged out: opens QR login. Logged in: account card. */
export function AccountButton() {
  const { profile, openLogin } = useAccount();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const checking = profile === undefined;
  const close = useCallback(() => setOpen(false), []);

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
        aria-haspopup="dialog"
        aria-expanded={profile ? open : undefined}
        data-tooltip={profile ? (open ? undefined : '账号信息') : '点击登录'}
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
      <AccountCard open={open && Boolean(profile)} anchor={anchor} onClose={close} />
    </>
  );
}
