'use client';

import { FileAudio, FolderOpen, FolderPlus, HardDrive, Play, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorState } from '@/components/common/AsyncState';
import { SearchField } from '@/components/common/SearchField';
import { usePlayer } from '@/components/player/player-store';
import { CollapsingHeader, Page, StickyBar } from '@/components/scroll';
import { Button, IconButton, Spinner, toast } from '@/components/ui';
import { localApi, localToTrack, type LocalTrack } from '@/lib/local-client';
import { libraryEvents, playLocalFiles } from './open-local-files';
import { TrackList } from './TrackList';
import styles from './Library.module.css';

const folderName = (folder: string) => folder.split(/[\\/]/).filter(Boolean).pop() ?? folder;

/**
 * 本地音乐: folders the user added (scanned recursively), plus files opened with
 * the app or downloaded. Files are never moved or modified.
 */
export function LocalView() {
  const player = usePlayer();
  const bridge = typeof window === 'undefined' ? undefined : window.coco?.files;
  const [data, setData] = useState<{ folders: string[]; tracks: LocalTrack[] } | null>(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(() => {
    localApi.library().then(next => { setData(next); setError(''); }).catch(cause => setError(cause instanceof Error ? cause.message : '加载失败'));
  }, []);
  useEffect(() => { load(); return libraryEvents.on(load); }, [load]);

  const scan = async (folder: string) => {
    setScanning(folder);
    try {
      const result = await localApi.scan(folder);
      toast.success(result.added || result.removed
        ? `「${folderName(folder)}」扫描完成：新增 ${result.added} 首${result.removed ? `，移除 ${result.removed} 首` : ''}`
        : `「${folderName(folder)}」已是最新，共 ${result.total} 首`);
      load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '扫描失败');
    } finally {
      setScanning(null);
    }
  };

  const addFolder = async () => {
    const folder = await bridge?.pickFolder();
    if (folder) await scan(folder);
  };
  const openFiles = async () => {
    const files = await bridge?.pickAudioFiles();
    if (files?.length) await playLocalFiles(files, player);
  };
  const removeFolder = async (folder: string) => {
    await localApi.removeFolder(folder).catch(() => undefined);
    toast.info(`已移除「${folderName(folder)}」，文件本身不会被删除`);
    load();
  };
  const rescanAll = async () => { for (const folder of data?.folders ?? []) await scan(folder); };

  const tracks = useMemo(() => (data?.tracks ?? []).map(item => ({ item, track: localToTrack(item) })), [data]);
  const needle = filter.trim().toLowerCase();
  const visible = needle ? tracks.filter(({ track }) => `${track.title} ${track.artist} ${track.album ?? ''}`.toLowerCase().includes(needle)) : tracks;

  if (error && !data) return <Page><ErrorState message={error} onRetry={load} /></Page>;

  const desktopOnly = !bridge;
  const actions = (
    <>
      <Button variant="primary" icon={<Play size={15} strokeWidth={0} fill="currentColor" />} disabled={!visible.length} onClick={() => player.play(visible[0].track, visible.map(row => row.track))}>播放全部</Button>
      <Button icon={<FolderPlus size={15} strokeWidth={1.5} />} onClick={() => void addFolder()} disabled={desktopOnly || Boolean(scanning)} title={desktopOnly ? '需要在桌面客户端中使用' : '选择一个文件夹，自动扫描其中的音乐'}>添加文件夹</Button>
      <Button icon={<FileAudio size={15} strokeWidth={1.5} />} onClick={() => void openFiles()} disabled={desktopOnly} title={desktopOnly ? '需要在桌面客户端中使用' : '直接打开音频文件播放'}>打开文件</Button>
      {Boolean(data?.folders.length) && (
        <IconButton label="重新扫描全部文件夹" onClick={() => void rescanAll()} disabled={Boolean(scanning)} iconHover={{ rotate: 180 }}>
          <RefreshCw size={17} strokeWidth={1.5} />
        </IconButton>
      )}
    </>
  );

  return (
    <Page gap="sm">
      <CollapsingHeader
        title="本地音乐"
        subtitle={data ? `${data.tracks.length} 首歌曲${data.folders.length ? ` · ${data.folders.length} 个文件夹` : ''} · 支持 MP3、FLAC、M4A、WAV、OGG 等格式，也可以直接把文件拖进窗口` : '正在读取本地曲库'}
        actions={actions}
      />

      {data && (data.folders.length > 0 || scanning) && (
        <div className={styles.folders}>
          {data.folders.map(folder => (
            <span key={folder} className={styles.folder} data-tooltip={folder}>
              <FolderOpen size={13} strokeWidth={1.6} />
              <span>{folderName(folder)}</span>
              {scanning === folder
                ? <Spinner size={13} />
                : <IconButton label={`移除「${folderName(folder)}」`} size="sm" tone="muted" onClick={() => void removeFolder(folder)}><X size={12} strokeWidth={1.8} /></IconButton>}
            </span>
          ))}
          {scanning && !data.folders.includes(scanning) && <span className={styles.scanning}><Spinner size={13} />正在扫描「{folderName(scanning)}」…</span>}
        </div>
      )}

      {data && data.tracks.length > 0 && (
        <StickyBar compactTitle="本地音乐">
          <div className={styles.toolbar}>
            <span className={styles.count}>歌曲 <small>{data.tracks.length}</small>{needle && <small className={styles.matches}>匹配 {visible.length} 首</small>}</span>
            <SearchField value={filter} onChange={setFilter} placeholder="搜索本地音乐" label="筛选本地音乐" className={styles.filter} />
          </div>
        </StickyBar>
      )}

      {data && !data.tracks.length ? (
        <div className={styles.emptyLocal}>
          <HardDrive size={40} strokeWidth={1.1} />
          <h2>还没有本地音乐</h2>
          <p>{desktopOnly
            ? '本地音乐需要在 CoCo Music 桌面客户端中使用：可以添加文件夹自动扫描，也可以把音频文件拖进窗口或用 CoCo Music 打开。'
            : '添加存放音乐的文件夹，CoCo Music 会自动识别歌曲信息、封面和歌词；也可以直接把音频文件拖进窗口。下载的歌曲也会出现在这里。'}</p>
          {!desktopOnly && (
            <div className={styles.emptyActions}>
              <Button variant="primary" icon={<FolderPlus size={15} strokeWidth={1.5} />} onClick={() => void addFolder()} disabled={Boolean(scanning)}>{scanning ? '扫描中…' : '添加文件夹'}</Button>
              <Button icon={<FileAudio size={15} strokeWidth={1.5} />} onClick={() => void openFiles()}>打开文件</Button>
            </div>
          )}
        </div>
      ) : (
        <TrackList
          emptyText={data ? '没有匹配的歌曲' : <Spinner size={20} />}
          rows={visible.map(({ item, track }) => ({
            track,
            meta: <span data-tooltip={item.path}>{track.album || (item.folder ? folderName(item.folder) : '单独打开的文件')}</span>,
            actions: bridge ? (
              <IconButton label={bridge && window.coco?.platform === 'darwin' ? '在访达中显示' : '在文件夹中显示'} size="sm" tone="muted" onClick={() => bridge.reveal(item.path)}>
                <FolderOpen size={15} strokeWidth={1.5} />
              </IconButton>
            ) : undefined,
          }))}
        />
      )}
    </Page>
  );
}
