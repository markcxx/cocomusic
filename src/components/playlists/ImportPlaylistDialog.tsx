'use client';

import { Eye, HardDriveDownload, Heart, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useAccount } from '@/components/account/account-store';
import { Cover } from '@/components/common/Cover';
import { useNavigation } from '@/components/layout/navigation';
import { Button, Dialog, DialogActions, toast } from '@/components/ui';
import { accountApi } from '@/lib/account-client';
import { catalogApi, type CatalogSource, type CollectionInfo } from '@/lib/catalog-client';
import { cn } from '@/lib/cn';
import { saveCollectionLocally } from '@/lib/collection-tracks';
import { useSettings } from '@/lib/settings';
import { SOURCE_NAMES } from '@/server/music/ids';
import styles from './ImportPlaylistDialog.module.css';

type Target = 'local' | 'subscribe' | 'open';
type Parsed = { source: CatalogSource; info: CollectionInfo };

/** 导入歌单: paste a share link, preview the playlist, then keep it locally, collect it on its platform, or just open it. */
export function ImportPlaylistDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="导入歌单" width={480}>
      {/* Mounted only while open, so every opening starts from an empty link. */}
      {open && <ImportForm onClose={onClose} />}
    </Dialog>
  );
}

function ImportForm({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');

  const resolve = async (value = text) => {
    if (!value.trim() || resolving) return;
    setResolving(true);
    setError('');
    try {
      const shared = await catalogApi.sharedPlaylist(value);
      const detail = await catalogApi.playlist(shared.id, 0, 1, undefined, shared.source);
      setParsed({ source: shared.source, info: detail.info });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法识别这个链接');
    } finally {
      setResolving(false);
    }
  };

  if (parsed) return <ImportTarget parsed={parsed} onBack={() => setParsed(null)} onClose={onClose} />;

  return (
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void resolve(); }}>
      <p className={styles.hint}>粘贴歌单的分享链接或分享文案，例如“分享歌单《…》: https://163cn.tv/…”。短链接会自动展开。</p>
      <div className={styles.field}>
        <input
          value={text}
          onChange={event => setText(event.target.value)}
          // A paste is the whole link: resolve it right away.
          onPaste={event => { const pasted = event.clipboardData.getData('text'); if (pasted.trim()) { event.preventDefault(); setText(pasted); void resolve(pasted); } }}
          placeholder="https://"
          aria-label="歌单分享链接"
          maxLength={2000}
        />
      </div>
      <p className={styles.platforms}>支持网易云音乐、QQ 音乐、酷狗音乐</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <DialogActions onCancel={onClose} onConfirm={() => void resolve()} confirmLabel={resolving ? '识别中…' : '识别链接'} busy={resolving} disabled={!text.trim()} />
    </form>
  );
}

/**
 * Login state of the playlist's platform. Logins are kept per platform, so a
 * playlist of another platform can still be collected when that one is signed in.
 */
function usePlatformLogin(source: CatalogSource) {
  const { profile } = useAccount();
  const selected = useSettings().catalogSource === source;
  const [other, setOther] = useState<{ source: CatalogSource; signedIn: boolean } | null>(null);
  useEffect(() => {
    if (selected) return;
    let cancelled = false;
    accountApi.me(source)
      .then(({ profile: current }) => { if (!cancelled) setOther({ source, signedIn: Boolean(current) }); })
      .catch(() => { if (!cancelled) setOther({ source, signedIn: false }); });
    return () => { cancelled = true; };
  }, [selected, source]);
  if (selected) return { selected, checking: profile === undefined, signedIn: Boolean(profile) };
  return { selected, checking: other?.source !== source, signedIn: other?.source === source && other.signedIn };
}

function Option({ value, current, onSelect, icon: Icon, title, disabled, children }: { value: Target; current: Target; onSelect: (value: Target) => void; icon: LucideIcon; title: string; disabled?: boolean; children: ReactNode }) {
  const on = value === current;
  return (
    <button type="button" role="radio" aria-checked={on} disabled={disabled} className={cn(styles.option, on && styles.optionOn)} onClick={() => onSelect(value)}>
      <span className={styles.optionIcon}><Icon size={18} strokeWidth={1.5} /></span>
      <span className={styles.optionText}><strong>{title}</strong><span>{children}</span></span>
    </button>
  );
}

function ImportTarget({ parsed, onBack, onClose }: { parsed: Parsed; onBack: () => void; onClose: () => void }) {
  const { source, info } = parsed;
  const { navigate } = useNavigation();
  const { isSubscribed, isOwnPlaylist, toggleSubscribe, openLogin } = useAccount();
  const login = usePlatformLogin(source);
  const [target, setTarget] = useState<Target>('local');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const platform = SOURCE_NAMES[source];
  const own = login.selected && isOwnPlaylist(info.id);
  const already = login.selected && isSubscribed(info.id);
  const canSubscribe = login.signedIn && !own;
  // Playlists of the selected platform open like any other; others carry their platform.
  const openPlaylist = () => navigate({ name: 'playlist', id: info.id, source: login.selected ? undefined : source, title: info.name });

  const subscribeHint = own
    ? '这是你在该平台创建的歌单，已在侧栏「创建的歌单」中'
    : already
      ? `已在${platform}收藏，导入后直接打开`
      : login.checking
        ? `正在检查${platform}登录状态…`
        : login.signedIn
          ? `收藏到你的${platform}账号，在各设备间同步`
          : login.selected
            ? `需要先登录${platform}`
            : `需要登录${platform}：在 设置 › 曲库 切换到该平台并登录后可用`;
  const offerLogin = login.selected && !login.checking && !login.signedIn;

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (target === 'local') {
        const playlist = await saveCollectionLocally({ kind: 'playlist', id: info.id, source }, info);
        toast.success(`已导入「${playlist.name}」，共 ${playlist.tracks.length} 首`);
        navigate({ name: 'local-playlist', id: playlist.id, title: playlist.name });
      } else if (target === 'subscribe') {
        if (login.selected) {
          // The account store keeps the sidebar's 收藏的歌单 in step.
          if (!already && !(await toggleSubscribe(info))) { setBusy(false); return; }
        } else {
          await accountApi.subscribe(info.id, true, source);
          toast.success(`已收藏到${platform}「${info.name}」`);
        }
        openPlaylist();
      } else {
        openPlaylist();
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导入失败，请稍后重试');
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void confirm(); }}>
      <div className={styles.preview}>
        <Cover seed={`${source}:playlist:${info.id}`} src={info.cover} size={64} radius={10} />
        <div className={styles.previewMeta}>
          <strong data-tooltip={info.name} data-tooltip-overflow>{info.name}</strong>
          <span>{platform} · {info.trackCount} 首{info.owner?.name ? ` · ${info.owner.name}` : ''}</span>
        </div>
        <span className={styles.change}><Button variant="ghost" onClick={onBack} disabled={busy}>换一个</Button></span>
      </div>
      <div className={styles.options} role="radiogroup" aria-label="导入方式">
        <Option value="local" current={target} onSelect={setTarget} icon={HardDriveDownload} title="存为本地歌单">
          复制全部歌曲到这台电脑，无需登录，之后可以加入其他平台的歌曲和本地文件
        </Option>
        <Option value="subscribe" current={target} onSelect={setTarget} icon={Heart} title={`收藏到${platform}`} disabled={!canSubscribe}>
          {subscribeHint}
        </Option>
        <Option value="open" current={target} onSelect={setTarget} icon={Eye} title="仅查看">
          打开歌单详情，稍后再决定
        </Option>
      </div>
      {offerLogin && <p className={styles.hint}>想同步到账号？<button type="button" className={styles.inlineLink} onClick={openLogin}>登录{platform}</button>后即可收藏。</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <DialogActions onCancel={onClose} onConfirm={() => void confirm()} confirmLabel={busy ? (target === 'local' ? '导入中…' : '处理中…') : target === 'open' ? '打开' : '导入'} busy={busy} />
    </form>
  );
}
