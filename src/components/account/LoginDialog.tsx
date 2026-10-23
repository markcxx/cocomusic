'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, RotateCw, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Dialog, Spinner } from '@/components/ui';
import { accountApi, type UserProfile } from '@/lib/account-client';
import { useLatest } from '@/lib/use-latest';
import { useAccount } from './account-store';
import styles from './LoginDialog.module.css';

type Phase =
  | { name: 'loading' }
  | { name: 'waiting'; svg: string }
  | { name: 'scanned'; svg: string; nickname?: string; avatar?: string }
  | { name: 'expired'; svg: string }
  | { name: 'success'; nickname: string }
  | { name: 'error'; message: string };

const POLL_MS = 1800;

/** Runs one QR session (create → poll) per `session` value; phases from older sessions are ignored. */
function useQrLogin(active: boolean, onLoggedIn: (profile: UserProfile) => void) {
  const [session, setSession] = useState(0);
  const [phase, setPhase] = useState<{ session: number; value: Phase } | null>(null);
  const loggedIn = useLatest(onLoggedIn);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const update = (value: Phase) => { if (!cancelled) setPhase({ session, value }); };
    void (async () => {
      try {
        const { key, svg } = await accountApi.qrCreate();
        update({ name: 'waiting', svg });
        while (!cancelled) {
          await new Promise(resolve => setTimeout(resolve, POLL_MS));
          if (cancelled) return;
          const state = await accountApi.qrCheck(key).catch(() => null);
          if (!state || cancelled) continue;
          if (state.status === 'scanned') update({ name: 'scanned', svg, nickname: state.nickname, avatar: state.avatar });
          if (state.status === 'expired') { update({ name: 'expired', svg }); return; }
          if (state.status === 'success') {
            update({ name: 'success', nickname: state.profile.nickname });
            setTimeout(() => { if (!cancelled) loggedIn.current(state.profile); }, 700);
            return;
          }
        }
      } catch (error) {
        update({ name: 'error', message: error instanceof Error ? error.message : '二维码获取失败' });
      }
    })();
    // Closing the dialog or refreshing the code stops this session's polling.
    return () => { cancelled = true; };
  }, [active, session, loggedIn]);

  const current: Phase = phase?.session === session ? phase.value : { name: 'loading' };
  return { phase: current, restart: () => setSession(value => value + 1) };
}

/** NetEase QR login: show code → poll until scanned/confirmed/expired. */
export function LoginDialog() {
  const { loginOpen, closeLogin, onLoggedIn } = useAccount();
  const { phase, restart } = useQrLogin(loginOpen, onLoggedIn);

  const svg = 'svg' in phase ? phase.svg : '';
  return (
    <Dialog open={loginOpen} onClose={closeLogin} title="登录网易云音乐" width={380}>
      <p className={styles.subtitle}>使用网易云音乐 App 扫码登录</p>
      <div className={styles.stage}>
        <AnimatePresence mode="wait" initial={false}>
          {phase.name === 'loading' && (
            <motion.div key="loading" className={styles.center} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Spinner size={22} />
            </motion.div>
          )}
          {phase.name === 'error' && (
            <motion.div key="error" className={styles.center} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className={styles.error}>{phase.message}</p>
              <button type="button" className={styles.retry} onClick={restart}><RotateCw size={14} />重试</button>
            </motion.div>
          )}
          {phase.name === 'success' && (
            <motion.div key="success" className={styles.center} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 360, damping: 20 }}>
              <CheckCircle2 size={48} strokeWidth={1.4} className={styles.ok} />
              <p>登录成功，{phase.nickname}</p>
            </motion.div>
          )}
          {svg && (
            <motion.div key="qr" className={styles.qrWrap} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              {/* Server-generated SVG from a fixed URL pattern; contains no user input. */}
              <motion.div className={styles.qr} animate={{ filter: phase.name === 'waiting' ? 'blur(0px)' : 'blur(6px)', opacity: phase.name === 'waiting' ? 1 : 0.35 }} dangerouslySetInnerHTML={{ __html: svg }} />
              <AnimatePresence>
                {phase.name === 'scanned' && (
                  <motion.div key="scanned" className={styles.overlay} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    {phase.avatar ? <img src={phase.avatar} alt="" className={styles.avatar} referrerPolicy="no-referrer" /> : <Smartphone size={36} strokeWidth={1.3} />}
                    <strong>{phase.nickname ?? '已扫码'}</strong>
                    <span>请在手机上确认登录</span>
                  </motion.div>
                )}
                {phase.name === 'expired' && (
                  <motion.button key="expired" type="button" className={styles.overlay} onClick={restart} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <RotateCw size={30} strokeWidth={1.4} />
                    <strong>二维码已过期</strong>
                    <span>点击刷新</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className={styles.note}>登录凭据仅保存在本机，用于获取你的歌单与喜欢的音乐。</p>
    </Dialog>
  );
}
