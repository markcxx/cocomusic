'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Crown, ExternalLink, History, LogOut, MapPin, Mars, Mic2, Sparkles, Venus } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { SkeletonBlock } from '@/components/common/AsyncState';
import { Cover } from '@/components/common/Cover';
import { useNavigation } from '@/components/layout/navigation';
import { accountApi, type UserDetail, type UserProfile } from '@/lib/account-client';
import { formatCount } from '@/lib/catalog-client';
import { cn } from '@/lib/cn';
import { useAccount } from './account-store';
import styles from './AccountCard.module.css';
import { shareUrl } from '@/lib/share-links';

const VIP_LABELS: Record<number, string> = { 10: '音乐包', 11: '黑胶VIP' };

function Stat({ value, label, onClick }: { value?: number; label: string; onClick?: () => void }) {
  const content = (
    <>
      <strong>{value === undefined ? '—' : formatCount(value) || '0'}</strong>
      <span>{label}</span>
    </>
  );
  return onClick
    ? <button type="button" className={styles.stat} onClick={onClick}>{content}</button>
    : <div className={styles.stat}>{content}</div>;
}

function Chip({ icon, children, tone }: { icon?: ReactNode; children: ReactNode; tone?: 'male' | 'female' }) {
  return <span className={cn(styles.chip, tone && styles[tone])}>{icon}{children}</span>;
}

function Action({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" className={cn(styles.action, danger && styles.danger)} onClick={onClick} role="menuitem">
      <span className={styles.actionIcon}>{icon}</span>
      {label}
    </button>
  );
}

/** Body; `detail` is null while loading (basic profile shown meanwhile). */
function CardBody({ profile, detail, error, onClose }: { profile: UserProfile; detail: UserDetail | null; error: boolean; onClose: () => void }) {
  const { navigate } = useNavigation();
  const { logout } = useAccount();
  const go = (fn: () => void) => () => { onClose(); fn(); };
  const vip = detail?.vipType ?? profile.vipType ?? 0;
  const since = detail?.createdAt ? new Date(detail.createdAt).getFullYear() : undefined;
  const loading = !detail && !error;

  return (
    <>
      <div className={styles.banner} aria-hidden>
        {detail?.background && <img src={detail.background} alt="" referrerPolicy="no-referrer" />}
      </div>

      <div className={styles.identity}>
        <span className={cn(styles.avatar, vip > 0 && styles.avatarVip)}>
          <Cover seed={`user:${profile.id}`} src={detail?.avatar ?? profile.avatar} radius={999} className={styles.avatarImage} />
        </span>
        <div className={styles.names}>
          <h2 data-tooltip={profile.nickname} data-tooltip-overflow>{detail?.nickname ?? profile.nickname}</h2>
          <div className={styles.badges}>
            {vip > 0 && <span className={styles.vip}><Crown size={11} strokeWidth={2} />{VIP_LABELS[vip] ?? 'VIP'}</span>}
            {detail?.level !== undefined && <span className={styles.level} data-tooltip="账号等级">Lv.{detail.level}</span>}
            {detail?.verified && <span className={styles.verified}><Mic2 size={11} strokeWidth={2} />{detail.verified}</span>}
          </div>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>
          <SkeletonBlock className={styles.skeletonLine} />
          <SkeletonBlock className={styles.skeletonShort} />
        </div>
      ) : (
        <>
          <p className={cn(styles.signature, !detail?.signature && styles.signatureEmpty)}>{detail?.signature ?? (error ? '个人资料暂时无法加载' : '这个人很懒，什么都没有写')}</p>
          {detail && (
            <div className={styles.chips}>
              {(detail.gender || detail.ageGroup || detail.zodiac) && (
                <Chip tone={detail.gender} icon={detail.gender === 'male' ? <Mars size={12} strokeWidth={2} /> : detail.gender === 'female' ? <Venus size={12} strokeWidth={2} /> : <Sparkles size={12} strokeWidth={2} />}>
                  {[detail.ageGroup, detail.zodiac].filter(Boolean).join(' · ') || (detail.gender === 'male' ? '男' : '女')}
                </Chip>
              )}
              {detail.region && <Chip icon={<MapPin size={12} strokeWidth={2} />}>{detail.region}</Chip>}
              {detail.accountDays !== undefined && (
                <span data-tooltip={since ? `${since} 年注册` : undefined}>
                  <Chip icon={<CalendarDays size={12} strokeWidth={2} />}>村龄 {detail.accountDays >= 365 ? `${Math.floor(detail.accountDays / 365)} 年` : `${detail.accountDays} 天`}</Chip>
                </span>
              )}
            </div>
          )}
        </>
      )}

      <div className={styles.stats}>
        <Stat value={detail?.follows} label="关注" />
        <Stat value={detail?.followers} label="粉丝" />
        <Stat value={detail?.events} label="动态" />
        <Stat value={detail?.listenSongs} label="累计听歌" />
      </div>


      <div className={styles.actions} role="menu">
        <Action icon={<History size={15} strokeWidth={1.6} />} label="最近播放" onClick={go(() => navigate({ name: 'recent' }))} />
        <Action
          icon={<ExternalLink size={15} strokeWidth={1.6} />}
          label="个人主页"
          onClick={go(() => { window.open(detail?.url ?? shareUrl(profile.source, 'user', profile.id), '_blank', 'noopener'); })}
        />
        <Action icon={<LogOut size={15} strokeWidth={1.6} />} label="退出登录" danger onClick={go(() => void logout())} />
      </div>
    </>
  );
}

/**
 * Account popover under the top-bar avatar. The basic profile renders at once;
 * the rich detail (level, stats, region…) fills in when it arrives.
 */
export function AccountCard({ open, anchor, onClose }: { open: boolean; anchor: RefObject<HTMLElement | null>; onClose: () => void }) {
  const { profile } = useAccount();
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const [state, setState] = useState<{ id?: string; detail: UserDetail | null; error: boolean }>({ detail: null, error: false });

  // Fetch on open (cached server-side for a couple of minutes).
  useEffect(() => {
    if (!open || !profile) return;
    const controller = new AbortController();
    accountApi.detail(controller.signal)
      .then(({ detail }) => setState({ id: profile.id, detail, error: !detail }))
      .catch(() => { if (!controller.signal.aborted) setState(previous => ({ id: profile.id, detail: previous.id === profile.id ? previous.detail : null, error: true })); });
    return () => controller.abort();
  }, [open, profile]);

  useLayoutEffect(() => {
    const target = anchor.current;
    if (!open || !target) return;
    const place = () => {
      const rect = target.getBoundingClientRect();
      setPosition({ top: rect.bottom + 8, right: Math.max(12, window.innerWidth - rect.right) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const node = event.target as Node;
      if (panel.current?.contains(node) || anchor.current?.contains(node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); window.removeEventListener('keydown', onKey); };
  }, [open, anchor, onClose]);

  if (typeof document === 'undefined' || !profile) return null;
  const detail = state.id === profile.id ? state.detail : null;
  const error = state.id === profile.id && state.error;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panel}
          className={cn(styles.card, (profile.vipType ?? 0) > 0 && styles.cardVip)}
          role="dialog"
          aria-label={`${profile.nickname} 的账号信息`}
          style={{ top: position?.top ?? -9999, right: position?.right ?? 0 }}
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.14 } }}
          transition={{ type: 'spring', stiffness: 460, damping: 34 }}
        >
          <CardBody profile={profile} detail={detail} error={error} onClose={onClose} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
