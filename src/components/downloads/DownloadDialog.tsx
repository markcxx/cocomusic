'use client';

import { useEffect, useState } from 'react';
import { Checkbox, Dialog, Spinner } from '@/components/ui';
import { downloadQualities, QUALITY_HINTS, QUALITY_LABELS, type DownloadQualityOption } from '@/lib/download-quality';
import { downloadsApi } from '@/lib/local-client';
import type { CatalogTrack } from '@/lib/catalog-client';
import type { AudioQuality } from '@/server/music/types';
import { downloads, useDownloadRequest, useDownloads } from './download-store';
import dialog from '@/components/ui/Dialog.module.css';
import styles from './DownloadDialog.module.css';

function Choices({ tracks }: { tracks: CatalogTrack[] }) {
  const { settings } = useDownloads();
  const levels = [...new Set(tracks.flatMap(track => downloadQualities(track.source)))];
  const [quality, setQuality] = useState<AudioQuality>(() => settings?.quality && levels.includes(settings.quality) ? settings.quality : 'exhigh');
  const [lyrics, setLyrics] = useState(settings?.lyrics ?? false);
  const [allowTrial, setAllowTrial] = useState(settings?.allowTrial ?? false);
  const [allowFallback, setAllowFallback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DownloadQualityOption[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const single = tracks.length === 1;
  useEffect(() => {
    if (!single) return;
    let alive = true;
    void downloadsApi.qualities(tracks[0]).then(({ options }) => {
      if (!alive) return;
      setResult(options);
      setQuality(previous => options.find(item => item.quality === previous && item.available)?.quality ?? options.findLast(item => item.available && !item.trial)?.quality ?? options.find(item => item.available)?.quality ?? previous);
    }).catch(cause => { if (alive) setError(cause instanceof Error ? cause.message : '权限查询失败'); });
    return () => { alive = false; };
  }, [tracks, single, attempt]);
  const selected = result?.find(item => item.quality === quality);
  const ready = !single || Boolean(selected?.available && (!selected.trial || allowTrial));
  return (
    <div className={dialog.body}>
      <p className={styles.summary}>{single ? tracks[0].title : `下载 ${tracks.length} 首歌曲`}<span>{single ? tracks[0].artist : '每首歌曲均会按当前账号权限核验'}</span></p>
      {single && !result && !error && <p className={styles.hint} role="status"><Spinner size={14} />正在查询当前账号可用的音质…</p>}
      {error && <p className={dialog.error} role="alert">{error} <button type="button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>重试</button></p>}
      <div className={styles.qualities} role="radiogroup" aria-label="下载音质">
        {levels.map(level => {
          const option = result?.find(item => item.quality === level);
          const disabled = busy || (single && !option?.available);
          return <button key={level} type="button" role="radio" aria-checked={quality === level} disabled={disabled} className={`${styles.quality} ${quality === level ? styles.selected : ''}`} onClick={() => setQuality(level)}>
            <strong>{QUALITY_LABELS[level]}{option?.trial ? ' · 试听' : ''}</strong>
            <span>{option && !option.available ? option.reason : QUALITY_HINTS[level]}</span>
          </button>;
        })}
      </div>
      {single && result && !result.some(item => item.available) && <p className={dialog.error} role="alert">暂时没有可下载的音质。请检查账号权限或稍后重试。<button type="button" onClick={() => { setResult(null); setError(''); setAttempt(value => value + 1); }}>重新检测</button></p>}
      <div className={styles.options}>
        <label><Checkbox checked={lyrics} onChange={() => setLyrics(value => !value)} label="同时下载歌词" />同时下载歌词</label>
        <label><Checkbox checked={allowTrial} onChange={() => setAllowTrial(value => !value)} label="允许保存试听片段" />允许保存试听片段<span>仅有试听权限时，在文件名中标记</span></label>
        <label><Checkbox checked={allowFallback} onChange={() => setAllowFallback(value => !value)} label="所选音质不可用时允许降级" />所选音质不可用时允许降级</label>
      </div>
      <p className={styles.hint}>{single ? '可用音质以平台对当前账号和这首歌曲的授权结果为准。登录、会员与单曲购买可能影响下载权限。' : '不同平台或歌曲的可用音质可能不同。未允许降级或试听时，无对应权限的任务会提示失败，不会保存替代音频。'}</p>
      <div className={dialog.actions}>
        <button type="button" className={`${dialog.action} ${dialog.cancel}`} onClick={downloads.closeRequest}>取消</button>
        <button type="button" className={`${dialog.action} ${dialog.confirm}`} disabled={busy || !ready} onClick={async () => { setBusy(true); try { await downloads.confirm(tracks, { quality, lyrics, allowTrial, allowFallback }); } finally { setBusy(false); } }}>{busy ? <Spinner size={14} /> : null}{busy ? '正在加入…' : '开始下载'}</button>
      </div>
    </div>
  );
}

/** Every download entry point shares one confirmation, including batch downloads. */
export function DownloadDialog() {
  const tracks = useDownloadRequest();
  return <Dialog open={tracks.length > 0} onClose={downloads.closeRequest} title="下载歌曲" width={520}>{tracks.length > 0 && <Choices key={tracks.map(track => `${track.source}:${track.id}`).join(',')} tracks={tracks} />}</Dialog>;
}
