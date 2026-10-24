'use client';

import { AppWindow, Disc3, Download, FolderCog, FolderOpen, Gauge, HardDrive, Info, Keyboard, Mic2, MonitorSpeaker, Music4, Palette, PictureInPicture2, Play, Sparkles, Trash2, Type } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from '@/components/account/account-store';
import { downloads, useDownloads } from '@/components/downloads/download-store';
import { useNavigation } from '@/components/layout/navigation';
import { usePlayer } from '@/components/player/player-store';
import { Page, useScrollArea } from '@/components/scroll';
import { Button, ConfirmDialog, toast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { downloadsApi } from '@/lib/local-client';
import { recentPlays } from '@/lib/recent-plays';
import { searchHistory } from '@/lib/search-history';
import { ACCENT_PRESETS, desktopLyricColor, LYRIC_COLORS, settings, useSettings, type Settings } from '@/lib/settings';
import type { AudioQuality } from '@/server/music/types';
import { ThemeColorControl } from './ColorPicker';
import { Range, Row, Section, Segmented, Select, Switch } from './controls';
import styles from './Settings.module.css';

const QUALITIES: ReadonlyArray<{ value: AudioQuality; label: string; hint: string }> = [
  { value: 'standard', label: '标准', hint: '128kbps，省流量' },
  { value: 'higher', label: '较高', hint: '192kbps' },
  { value: 'exhigh', label: '极高', hint: '320kbps' },
  { value: 'lossless', label: '无损', hint: 'FLAC，需要会员' },
  { value: 'hires', label: 'Hi-Res', hint: '高解析度，需要会员' },
];

const PLATFORMS = [
  { value: 'netease', label: '网易云音乐' },
  { value: 'qq', label: 'QQ 音乐' },
  { value: 'kugou', label: '酷狗音乐' },
] as const;

const WINDOW_EFFECT_HINTS: Record<string, string> = {
  vibrancy: '系统毛玻璃：背后的桌面被实时模糊后透出来，模糊强度由系统决定',
  acrylic: '系统亚克力：背后的桌面被强模糊并带细微噪点，模糊强度由系统决定',
  mica: '云母：取桌面壁纸的柔和色调（Windows 11），不透出其他窗口',
  transparent: '和桌面歌词一样的真透明窗口：背后的桌面和窗口清晰可见，不做模糊',
  none: '不透明窗口',
};

const LYRIC_PRESETS = (Object.keys(LYRIC_COLORS) as Array<keyof typeof LYRIC_COLORS>).map(id => ({ label: LYRIC_COLORS[id].label, color: LYRIC_COLORS[id].to }));

const SECTIONS = [
  { id: 'catalog', label: '曲库', icon: Disc3 },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'playback', label: '播放', icon: Play },
  { id: 'lyrics', label: '歌词页', icon: Type },
  { id: 'desktop-lyrics', label: '桌面歌词', icon: Mic2 },
  { id: 'mini', label: '迷你模式', icon: PictureInPicture2 },
  { id: 'downloads', label: '下载', icon: Download },
  { id: 'library', label: '本地与数据', icon: HardDrive },
  { id: 'shortcuts', label: '快捷键', icon: Keyboard },
  { id: 'system', label: '系统', icon: AppWindow },
  { id: 'about', label: '关于', icon: Info },
] as const;

const keysOf = (...keys: Array<keyof Settings>) => keys;
const isMac = () => typeof window !== 'undefined' && window.coco?.platform === 'darwin';
const mod = () => (isMac() ? '⌘' : 'Ctrl');
const accelerator = (value: string) => value
  .replace('CommandOrControl', isMac() ? '⌘' : 'Ctrl')
  .replace('Alt', isMac() ? '⌥' : 'Alt')
  .replace(/Right$/, '→').replace(/Left$/, '←').replace(/Up$/, '↑').replace(/Down$/, '↓')
  .split('+').join(isMac() ? '' : ' + ');

function Kbd({ children }: { children: string }) {
  return <span className={styles.kbd}>{children}</span>;
}

function useOutputDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media?.enumerateDevices) return;
    const load = () => media.enumerateDevices().then(list => setDevices(list.filter(device => device.kind === 'audiooutput' && device.deviceId !== 'default' && device.deviceId !== 'communications'))).catch(() => undefined);
    void load();
    media.addEventListener?.('devicechange', load);
    return () => media.removeEventListener?.('devicechange', load);
  }, []);
  return devices;
}

/** Main-process settings (desktop only). */
function useAppSettings() {
  const [result, setResult] = useState<CocoAppSettingsResult | null>(null);
  useEffect(() => { void window.coco?.app?.getSettings().then(setResult).catch(() => undefined); }, []);
  const update = useCallback(async (patch: Partial<CocoAppSettings>) => {
    const next = await window.coco?.app?.setSettings(patch).catch(() => null);
    if (next) setResult(next);
    return next;
  }, []);
  return { result, update };
}

/** 设置: every option here is applied live; sections jump from the sticky index on the left. */
export function SettingsView() {
  const s = useSettings();
  const desktopColor = desktopLyricColor(s);
  const account = useAccount();
  const player = usePlayer();
  const { navigate } = useNavigation();
  const { element } = useScrollArea();
  const devices = useOutputDevices();
  const app = useAppSettings();
  const desktop = typeof window !== 'undefined' && Boolean(window.coco);
  const { settings: dl, folder } = useDownloads();
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  const [confirm, setConfirm] = useState<null | 'recent' | 'all'>(null);
  const clicking = useRef(0);

  const set = <K extends keyof Settings>(key: K) => (value: Settings[K]) => settings.set(key, value);

  // Highlight the section in view (scroll-spy), unless a click just scrolled us there.
  useEffect(() => {
    const root = element();
    if (!root) return;
    const onScroll = () => {
      // event.timeStamp shares performance.now()'s clock with the click that set `clicking`.
      if (performance.now() - clicking.current < 600) return;
      const sections = [...root.querySelectorAll<HTMLElement>('[data-settings-section]')];
      const top = root.getBoundingClientRect().top + 120;
      let current = sections[0]?.dataset.settingsSection;
      for (const section of sections) if (section.getBoundingClientRect().top <= top) current = section.dataset.settingsSection;
      // At the very bottom, the last section wins even if it is short.
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 4) current = sections.at(-1)?.dataset.settingsSection;
      if (current) setActive(current);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [element]);

  const jump = (id: string, at: number) => {
    const root = element();
    const target = root?.querySelector<HTMLElement>(`#settings-${id}`);
    if (!root || !target) return;
    clicking.current = at;
    setActive(id);
    root.scrollTo({ top: target.offsetTop - 16, behavior: 'smooth' });
  };

  const previewDesktopLyrics = () => {
    if (!window.coco?.lyrics) { toast.info('桌面歌词需要在桌面客户端中使用'); return; }
    window.coco.lyrics.setDesktop(true);
  };

  const pickDownloadFolder = async () => {
    const next = await window.coco?.files?.pickFolder();
    if (next) { await downloads.run(() => downloadsApi.setFolder(next)); toast.success('下载目录已更改'); }
  };

  const loginSupported = app.result?.info.loginItemSupported;

  // Transparency is fixed when the window is created: switching to/from 透明 needs a restart.
  const launchedTransparent = typeof window !== 'undefined' && window.coco?.material === 'transparent';
  const shownEffect = s.windowEffect === 'none' || s.windowEffect === 'transparent' ? s.windowEffect
    : isMac() ? 'vibrancy' : s.windowEffect === 'vibrancy' ? 'acrylic' : s.windowEffect;
  const needsRestart = desktop && (s.windowEffect === 'transparent') !== launchedTransparent;
  const chooseEffect = async (value: Settings['windowEffect']) => {
    settings.set('windowEffect', value);
    await app.update({ transparentWindow: value === 'transparent' });
  };
  const conflicts = useMemo(() => app.result?.shortcuts.filter(item => item.conflict) ?? [], [app.result]);

  return (
    <Page className={styles.page}>
      <header className={styles.hero}>
        <h1>设置</h1>
        <p>所有设置即时生效，并保存在本机。</p>
      </header>

      <div className={styles.layout}>
        <nav className={styles.index} aria-label="设置分类">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={cn(styles.indexItem, active === id && styles.indexActive)} onClick={event => jump(id, event.timeStamp)} aria-current={active === id ? 'true' : undefined}>
              <Icon size={15} strokeWidth={1.6} />{label}
            </button>
          ))}
        </nav>

        <div className={styles.sections}>
          {/* ───────── 曲库 ───────── */}
          <Section id="catalog" icon={<Disc3 size={17} strokeWidth={1.6} />} title="曲库" description="选择浏览、搜索和登录所使用的音乐平台">
            <Row title="音乐平台" description="首页、发现、排行榜、搜索和账号都会切换到所选平台；播放列表中已有的歌曲仍从原平台播放">
              <Segmented value={s.catalogSource} onChange={set('catalogSource')} label="音乐平台" options={[...PLATFORMS]} />
            </Row>
            <Row
              title="账号"
              description={account.profile
                ? `已登录${PLATFORMS.find(item => item.value === s.catalogSource)?.label}：${account.profile.nickname}。每个平台的登录状态分别保存`
                : '每个平台的登录状态分别保存，切换平台后需要登录对应平台的账号'}
            >
              {account.profile
                ? <Button variant="ghost" onClick={() => void account.logout()}>退出登录</Button>
                : <Button onClick={account.openLogin} disabled={account.profile === undefined}>登录</Button>}
            </Row>
          </Section>

          {/* ───────── 外观 ───────── */}
          <Section id="appearance" icon={<Palette size={17} strokeWidth={1.6} />} title="外观" description="深浅色、窗口透明、毛玻璃与主题色" onReset={() => settings.reset(keysOf('themeMode', 'windowEffect', 'windowOpacity', 'glassOpacity', 'glassBlur', 'accent', 'reduceMotion', 'zoom'))}>
            <Row title="外观模式" description="跟随系统时，系统切换深浅色会自动同步">
              <Segmented value={s.themeMode} onChange={set('themeMode')} label="外观模式" options={[{ value: 'system', label: '跟随系统' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]} />
            </Row>

            <div className={styles.groupLabel}>窗口</div>
            <Row
              title="窗口效果"
              description={!desktop ? '需要在桌面客户端中使用' : WINDOW_EFFECT_HINTS[s.windowEffect] ?? WINDOW_EFFECT_HINTS.none}
              disabled={!desktop}
            >
              <Segmented
                value={shownEffect}
                onChange={value => void chooseEffect(value)}
                label="窗口效果"
                options={isMac()
                  ? [{ value: 'vibrancy', label: '毛玻璃' }, { value: 'transparent', label: '透明' }, { value: 'none', label: '不透明' }]
                  : [{ value: 'acrylic', label: '亚克力' }, { value: 'mica', label: '云母' }, { value: 'transparent', label: '透明' }, { value: 'none', label: '不透明' }]}
              />
            </Row>
            {needsRestart && (
              <div className={styles.notice}>
                <span>“透明”需要重新创建窗口，重启应用后生效。</span>
                <Button variant="primary" onClick={() => window.coco?.app?.relaunch()}>立即重启</Button>
              </div>
            )}
            <Row
              title="窗口不透明度"
              description={!desktop ? '需要在桌面客户端中使用' : s.windowEffect === 'none' ? '先选择毛玻璃、亚克力或透明' : s.windowEffect === 'transparent' ? '越低越能清楚看到背后的桌面和其他窗口，文字和按钮始终保持清晰' : '越低越能看到背后被系统模糊的桌面'}
              disabled={!desktop || s.windowEffect === 'none'}
            >
              <Range value={s.windowOpacity} max={100} step={5} onChange={set('windowOpacity')} label="窗口不透明度" format={value => `${value}%`} />
            </Row>

            <div className={styles.groupLabel}>面板毛玻璃</div>
            <Row title="面板不透明度" description="内容区、播放栏和卡片的透明程度">
              <Range value={s.glassOpacity} max={100} onChange={set('glassOpacity')} label="面板不透明度" format={value => `${value}%`} />
            </Row>
            <Row title="面板模糊" description="面板背后内容的模糊程度，设为 0 时为清透玻璃">
              <Range value={s.glassBlur} max={60} step={2} onChange={set('glassBlur')} label="面板模糊" format={value => `${value}px`} />
            </Row>

            <div className={styles.groupLabel}>颜色与显示</div>
            <Row title="主题色" description={<>按钮、进度条、高亮等强调色，可点最后一个色块自定义任意颜色 <span className={styles.hexTag}>{s.accent.toUpperCase()}</span></>}>
              <ThemeColorControl value={s.accent} presets={ACCENT_PRESETS} onChange={set('accent')} />
            </Row>
            <Row title="界面缩放" description="整体放大或缩小界面">
              <Segmented value={s.zoom} onChange={set('zoom')} label="界面缩放" options={[{ value: 90, label: '90%' }, { value: 100, label: '100%' }, { value: 110, label: '110%' }, { value: 120, label: '120%' }]} />
            </Row>
            <Row title="减弱动态效果" description="关闭页面过渡、旋转唱片等动画；系统开启“减弱动态效果”时会自动生效">
              <Switch checked={s.reduceMotion} onChange={set('reduceMotion')} label="减弱动态效果" />
            </Row>
          </Section>

          {/* ───────── 播放 ───────── */}
          <Section id="playback" icon={<Play size={17} strokeWidth={1.6} />} title="播放" description="音质、过渡、输出设备与续播" onReset={() => settings.reset(keysOf('quality', 'fadeMs', 'playbackRate', 'outputDevice', 'resumeOnLaunch', 'resumePosition', 'skipOnError', 'doubleClick', 'trialNotice', 'showVipBadge'))}>
            <Row title="在线播放音质" description="更高音质需要账号有对应权限，不满足时会自动使用可用的最高音质">
              <Select value={s.quality} onChange={set('quality')} label="在线播放音质" options={QUALITIES} />
            </Row>
            <Row title="淡入淡出" description="播放、暂停时音量平滑过渡">
              <Range value={s.fadeMs} max={1500} step={100} onChange={set('fadeMs')} label="淡入淡出" format={value => (value ? `${(value / 1000).toFixed(1)} 秒` : '关闭')} />
            </Row>
            <Row title="播放速度" description="调整速度时保持原有音调">
              <Segmented value={s.playbackRate} onChange={set('playbackRate')} label="播放速度" options={[0.75, 1, 1.25, 1.5, 2].map(value => ({ value, label: `${value}×` }))} />
            </Row>
            <Row title="输出设备" description={devices.length ? '选择用于播放的扬声器或耳机' : '未检测到其他输出设备，将使用系统默认设备'}>
              <Select
                value={s.outputDevice}
                onChange={set('outputDevice')}
                label="输出设备"
                options={[{ value: '', label: '系统默认' }, ...devices.map((device, index) => ({ value: device.deviceId, label: device.label || `输出设备 ${index + 1}` }))]}
              />
            </Row>
            <Row title="双击歌曲" description="在歌单、排行榜等列表中双击一首歌时">
              <Segmented value={s.doubleClick} onChange={set('doubleClick')} label="双击歌曲" options={[{ value: 'replace', label: '播放整个列表' }, { value: 'insert', label: '仅插入这首' }]} />
            </Row>
            <Row title="启动时恢复上次播放" description="打开应用时恢复播放列表和上次的歌曲（不会自动开始播放）">
              <Switch checked={s.resumeOnLaunch} onChange={set('resumeOnLaunch')} label="启动时恢复上次播放" />
            </Row>
            <Row title="恢复播放进度" description="从上次停下的位置继续，而不是从头开始" disabled={!s.resumeOnLaunch}>
              <Switch checked={s.resumePosition} onChange={set('resumePosition')} label="恢复播放进度" disabled={!s.resumeOnLaunch} />
            </Row>
            <Row title="播放失败时自动跳过" description="遇到无版权或无法播放的歌曲时自动播放下一首">
              <Switch checked={s.skipOnError} onChange={set('skipOnError')} label="播放失败时自动跳过" />
            </Row>
            <Row title="试听提示" description="只能播放试听片段时弹出提示">
              <Switch checked={s.trialNotice} onChange={set('trialNotice')} label="试听提示" />
            </Row>
            <Row title="显示 VIP 标签" description="在歌曲列表中标出需要会员的歌曲">
              <Switch checked={s.showVipBadge} onChange={set('showVipBadge')} label="显示 VIP 标签" />
            </Row>
          </Section>

          {/* ───────── 歌词页 ───────── */}
          <Section id="lyrics" icon={<Type size={17} strokeWidth={1.6} />} title="歌词页" description="全屏歌词的字号、翻译与背景" onReset={() => settings.reset(keysOf('lyricsFontSize', 'lyricsShowTranslation', 'lyricsBlurInactive', 'lyricsAlign', 'lyricsBackground', 'lyricsOffset', 'lyricsSpinCover', 'lyricsKeepAwake'))}>
            <Row title="歌词字号">
              <Range value={s.lyricsFontSize} min={14} max={32} onChange={set('lyricsFontSize')} label="歌词字号" format={value => `${value}px`} />
            </Row>
            <Row title="显示翻译" description="有翻译的歌曲在原文下方显示译文">
              <Switch checked={s.lyricsShowTranslation} onChange={set('lyricsShowTranslation')} label="显示翻译" />
            </Row>
            <Row title="对齐方式">
              <Segmented value={s.lyricsAlign} onChange={set('lyricsAlign')} label="对齐方式" options={[{ value: 'left', label: '左对齐' }, { value: 'center', label: '居中' }]} />
            </Row>
            <Row title="景深效果" description="模糊非当前行，让视线聚焦在正在演唱的歌词上">
              <Switch checked={s.lyricsBlurInactive} onChange={set('lyricsBlurInactive')} label="景深效果" />
            </Row>
            <Row title="背景">
              <Segmented value={s.lyricsBackground} onChange={set('lyricsBackground')} label="背景" options={[{ value: 'cover', label: '封面模糊' }, { value: 'plain', label: '纯色' }]} />
            </Row>
            <Row title="唱片封面" description="封面显示为旋转的唱片">
              <Switch checked={s.lyricsSpinCover} onChange={set('lyricsSpinCover')} label="唱片封面" />
            </Row>
            <Row title="歌词偏移" description="歌词总是快或慢时微调，桌面歌词和迷你模式同样生效">
              <Range value={s.lyricsOffset} min={-3} max={3} step={0.1} onChange={value => settings.set('lyricsOffset', Math.round(value * 10) / 10)} label="歌词偏移" format={value => (value === 0 ? '0 秒' : `${value > 0 ? '提前' : '延后'} ${Math.abs(value).toFixed(1)} 秒`)} />
            </Row>
            <Row title="保持屏幕常亮" description="歌词页打开并正在播放时，阻止屏幕自动熄灭">
              <Switch checked={s.lyricsKeepAwake} onChange={set('lyricsKeepAwake')} label="保持屏幕常亮" />
            </Row>
            <Row title="预览">
              <Button icon={<Sparkles size={15} strokeWidth={1.5} />} onClick={player.openLyrics} disabled={!player.track.songId && !player.track.localId}>打开歌词页</Button>
            </Row>
          </Section>

          {/* ───────── 桌面歌词 ───────── */}
          <Section id="desktop-lyrics" icon={<Mic2 size={17} strokeWidth={1.6} />} title="桌面歌词" description="悬浮在桌面上的歌词样式，修改后立即同步" onReset={() => settings.reset(keysOf('desktopFontSize', 'desktopColor', 'desktopCustomColor', 'desktopShowTranslation', 'desktopSecondLine', 'desktopKaraoke', 'desktopStroke', 'desktopAlign', 'desktopFontWeight'))}>
            <div className={styles.lyricPreview} style={{ '--from': desktopColor.from, '--to': desktopColor.to, '--weight': s.desktopFontWeight, '--size': `${Math.min(s.desktopFontSize, 40)}px`, textAlign: s.desktopAlign } as React.CSSProperties} aria-hidden>
              <p className={cn(styles.lyricPreviewMain, !s.desktopStroke && styles.noStroke)}>
                <span className={styles.lyricPreviewBase}>难以忘记初次见你</span>
                <span className={styles.lyricPreviewFill} style={{ clipPath: `inset(0 ${s.desktopKaraoke ? 45 : 0}% 0 0)` }}>难以忘记初次见你</span>
              </p>
              {s.desktopSecondLine !== 'none' && <p className={cn(styles.lyricPreviewSub, !s.desktopStroke && styles.noStroke)}>{s.desktopSecondLine === 'translation' && s.desktopShowTranslation ? 'Hard to forget the first time I saw you' : '一双迷人的眼睛'}</p>}
            </div>
            <Row title="歌词颜色" description="已唱部分的颜色，最后一个色块可用调色板自定义">
              <ThemeColorControl
                label="歌词颜色"
                value={desktopColor.to}
                presets={LYRIC_PRESETS}
                onChange={hex => {
                  const preset = (Object.keys(LYRIC_COLORS) as Array<keyof typeof LYRIC_COLORS>).find(id => LYRIC_COLORS[id].to.toLowerCase() === hex.toLowerCase());
                  if (preset) settings.set('desktopColor', preset);
                  else { settings.set('desktopCustomColor', hex.toLowerCase()); settings.set('desktopColor', 'custom'); }
                }}
              />
            </Row>
            <Row title="字号" description="也可以在桌面歌词上用 − / + 调整">
              <Range value={s.desktopFontSize} min={20} max={64} step={2} onChange={set('desktopFontSize')} label="桌面歌词字号" format={value => `${value}px`} />
            </Row>
            <Row title="字重">
              <Segmented value={s.desktopFontWeight} onChange={set('desktopFontWeight')} label="字重" options={[{ value: 500, label: '常规' }, { value: 700, label: '粗体' }, { value: 900, label: '特粗' }]} />
            </Row>
            <Row title="对齐方式">
              <Segmented value={s.desktopAlign} onChange={set('desktopAlign')} label="桌面歌词对齐" options={[{ value: 'left', label: '左' }, { value: 'center', label: '居中' }, { value: 'right', label: '右' }]} />
            </Row>
            <Row title="第二行" description="当前歌词下方显示的内容">
              <Segmented value={s.desktopSecondLine} onChange={set('desktopSecondLine')} label="第二行" options={[{ value: 'translation', label: '翻译优先' }, { value: 'next', label: '下一句' }, { value: 'none', label: '不显示' }]} />
            </Row>
            <Row title="显示翻译">
              <Switch checked={s.desktopShowTranslation} onChange={set('desktopShowTranslation')} label="桌面歌词显示翻译" />
            </Row>
            <Row title="逐字高亮" description="像卡拉 OK 一样随演唱进度填充颜色">
              <Switch checked={s.desktopKaraoke} onChange={set('desktopKaraoke')} label="逐字高亮" />
            </Row>
            <Row title="文字描边" description="浅色壁纸上更清晰">
              <Switch checked={s.desktopStroke} onChange={set('desktopStroke')} label="文字描边" />
            </Row>
            <Row title="打开桌面歌词">
              <Button icon={<Mic2 size={15} strokeWidth={1.5} />} onClick={previewDesktopLyrics} disabled={!desktop}>{desktop ? '显示桌面歌词' : '需要桌面客户端'}</Button>
            </Row>
          </Section>

          {/* ───────── 迷你模式 ───────── */}
          <Section id="mini" icon={<PictureInPicture2 size={17} strokeWidth={1.6} />} title="迷你模式" description="悬浮播放条" onReset={() => settings.reset(keysOf('miniShowLyrics', 'miniSpinRecord'))}>
            <Row title="显示滚动歌词" description="关闭时显示歌手名">
              <Switch checked={s.miniShowLyrics} onChange={set('miniShowLyrics')} label="迷你模式显示歌词" />
            </Row>
            <Row title="唱片旋转" description="播放时封面唱片缓慢旋转">
              <Switch checked={s.miniSpinRecord} onChange={set('miniSpinRecord')} label="唱片旋转" />
            </Row>
            <Row title="进入迷你模式">
              <Button icon={<PictureInPicture2 size={15} strokeWidth={1.5} />} onClick={() => window.coco?.window.toggleMini()} disabled={!desktop}>{desktop ? '切换到迷你模式' : '需要桌面客户端'}</Button>
            </Row>
          </Section>

          {/* ───────── 下载 ───────── */}
          <Section id="downloads" icon={<Download size={17} strokeWidth={1.6} />} title="下载" description="保存位置、音质与文件命名" onReset={dl ? () => void downloads.updateSettings({ quality: 'exhigh', naming: 'artist-title', lyrics: true, allowTrial: true, concurrency: 2 }) : undefined}>
            <Row title="下载目录" description={<span className={styles.path} data-tooltip={folder}>{folder || '—'}</span>}>
              <div className={styles.inline}>
                {desktop && <Button icon={<FolderOpen size={15} strokeWidth={1.5} />} onClick={() => folder && window.coco?.files?.reveal(folder + (isMac() ? '/' : '\\'))} disabled={!folder}>打开</Button>}
                <Button icon={<FolderCog size={15} strokeWidth={1.5} />} onClick={() => void pickDownloadFolder()} disabled={!desktop}>更改</Button>
              </div>
            </Row>
            <Row title="下载音质" description="受账号权限限制，实际音质可能更低">
              <Select value={dl?.quality ?? 'exhigh'} onChange={value => void downloads.updateSettings({ quality: value })} label="下载音质" options={QUALITIES} />
            </Row>
            <Row title="文件命名">
              <Select
                value={dl?.naming ?? 'artist-title'}
                onChange={value => void downloads.updateSettings({ naming: value })}
                label="文件命名"
                options={[{ value: 'artist-title', label: '歌手 - 歌名' }, { value: 'title-artist', label: '歌名 - 歌手' }, { value: 'title', label: '歌名' }]}
              />
            </Row>
            <Row title="同时下载歌词" description="保存为同名 .lrc 文件，其他播放器也能识别">
              <Switch checked={dl?.lyrics ?? true} onChange={value => void downloads.updateSettings({ lyrics: value })} label="同时下载歌词" />
            </Row>
            <Row title="允许下载试听片段" description="没有完整播放权限时保存试听片段（文件名会标注“试听”）；关闭后这类歌曲会提示下载失败">
              <Switch checked={dl?.allowTrial ?? true} onChange={value => void downloads.updateSettings({ allowTrial: value })} label="允许下载试听片段" />
            </Row>
            <Row title="同时下载数量">
              <Segmented value={dl?.concurrency ?? 2} onChange={value => void downloads.updateSettings({ concurrency: value })} label="同时下载数量" options={[1, 2, 3, 5].map(value => ({ value, label: String(value) }))} />
            </Row>
          </Section>

          {/* ───────── 本地与数据 ───────── */}
          <Section id="library" icon={<HardDrive size={17} strokeWidth={1.6} />} title="本地与数据" description="本地音乐、播放记录与应用数据">
            <Row title="本地音乐文件夹" description="管理已添加的文件夹和重新扫描">
              <Button icon={<Music4 size={15} strokeWidth={1.5} />} onClick={() => navigate({ name: 'local' })}>前往本地音乐</Button>
            </Row>
            <Row title="记录搜索历史" description="关闭后不再保存新的搜索关键词">
              <Switch checked={s.rememberSearches} onChange={value => { settings.set('rememberSearches', value); if (!value) searchHistory.clear(); }} label="记录搜索历史" />
            </Row>
            <Row title="搜索历史" description="仅保存在本机，最多 12 条">
              <Button icon={<Trash2 size={15} strokeWidth={1.5} />} onClick={() => { searchHistory.clear(); toast.info('搜索历史已清空'); }}>清空</Button>
            </Row>
            <Row title="最近播放记录" description="仅保存在本机，最多 300 首">
              <Button icon={<Trash2 size={15} strokeWidth={1.5} />} onClick={() => setConfirm('recent')}>清空</Button>
            </Row>
            <Row title="应用数据" description={app.result ? <span className={styles.path} data-tooltip={app.result.info.dataDir}>{app.result.info.dataDir}</span> : '登录信息、本地曲库索引与下载记录都保存在这里'}>
              <Button icon={<FolderOpen size={15} strokeWidth={1.5} />} onClick={() => window.coco?.app?.openDataFolder()} disabled={!desktop}>打开文件夹</Button>
            </Row>
            <Row title="恢复全部默认设置" description="外观、播放、歌词等设置回到初始状态，不影响登录、曲库与下载">
              <Button icon={<Gauge size={15} strokeWidth={1.5} />} onClick={() => setConfirm('all')}>恢复默认</Button>
            </Row>
          </Section>

          {/* ───────── 快捷键 ───────── */}
          <Section id="shortcuts" icon={<Keyboard size={17} strokeWidth={1.6} />} title="快捷键" description="应用内快捷键与系统全局快捷键" onReset={() => settings.reset(keysOf('appShortcuts', 'seekStep'))}>
            <Row title="应用内快捷键" description="窗口处于前台时生效">
              <Switch checked={s.appShortcuts} onChange={set('appShortcuts')} label="应用内快捷键" />
            </Row>
            <div className={cn(styles.shortcuts, !s.appShortcuts && styles.rowDisabled)}>
              {[['播放 / 暂停', 'Space'], ['上一首', `${mod()} ←`], ['下一首', `${mod()} →`], ...(s.seekStep ? [[`快退 ${s.seekStep} 秒`, '←'], [`快进 ${s.seekStep} 秒`, '→']] : []), ['音量加', `${mod()} ↑`], ['音量减', `${mod()} ↓`], ['关闭歌词页 / 弹窗', 'Esc']].map(([label, key]) => (
                <div key={label} className={styles.shortcut}><span>{label}</span><Kbd>{key}</Kbd></div>
              ))}
            </div>
            <Row title="快进快退" description="按 ← / → 在当前歌曲内跳转的秒数" disabled={!s.appShortcuts}>
              <Segmented value={s.seekStep} onChange={set('seekStep')} label="快进快退" options={[{ value: 0, label: '关闭' }, { value: 5, label: '5 秒' }, { value: 10, label: '10 秒' }, { value: 15, label: '15 秒' }, { value: 30, label: '30 秒' }]} />
            </Row>
            <Row
              title="全局快捷键"
              description={desktop ? (conflicts.length ? `以下组合已被其他应用占用：${conflicts.map(item => accelerator(item.accelerator)).join('、')}` : '应用在后台时也能控制播放') : '需要在桌面客户端中使用'}
              disabled={!desktop}
            >
              <Switch checked={Boolean(app.result?.settings.globalShortcuts)} onChange={value => void app.update({ globalShortcuts: value })} label="全局快捷键" disabled={!desktop} />
            </Row>
            {app.result && (
              <div className={cn(styles.shortcuts, !app.result.settings.globalShortcuts && styles.rowDisabled)}>
                {app.result.shortcuts.map(item => (
                  <div key={item.accelerator} className={cn(styles.shortcut, item.conflict && styles.conflict)}><span>{item.label}</span><Kbd>{accelerator(item.accelerator)}</Kbd></div>
                ))}
              </div>
            )}
          </Section>

          {/* ───────── 系统 ───────── */}
          <Section id="system" icon={<AppWindow size={17} strokeWidth={1.6} />} title="系统" description="启动、关闭与通知">
            <Row title="开机自动启动" description={loginSupported ? '登录系统后自动打开 CoCo Music' : desktop ? '需要安装后的正式版应用（开发模式下不可用）' : '需要在桌面客户端中使用'} disabled={!loginSupported}>
              <Switch checked={Boolean(app.result?.settings.openAtLogin)} onChange={value => void app.update({ openAtLogin: value })} label="开机自动启动" disabled={!loginSupported} />
            </Row>
            <Row title="关闭主窗口时" description={isMac() ? '“后台播放”时窗口隐藏，点击程序坞或菜单栏图标可恢复' : '“后台播放”时窗口收进系统托盘，音乐继续播放；关闭托盘图标时改为最小化'} disabled={!desktop}>
              <Segmented value={app.result?.settings.closeBehavior ?? 'minimize'} onChange={value => void app.update({ closeBehavior: value })} label="关闭主窗口时" options={[{ value: 'quit', label: '退出应用' }, { value: 'minimize', label: '后台播放' }]} />
            </Row>
            <Row
              title={isMac() ? '菜单栏图标' : '系统托盘图标'}
              description={isMac() ? '右上角菜单栏显示图标，点按可控制播放；关闭窗口后也能从这里找回' : '任务栏通知区域显示图标，右键可控制播放；关闭窗口后台播放时从这里找回'}
              disabled={!desktop}
            >
              <Switch checked={s.showTray} onChange={set('showTray')} label={isMac() ? '菜单栏图标' : '系统托盘图标'} disabled={!desktop} />
            </Row>
            {isMac() && (
              <Row title="菜单栏歌词" description="播放时在菜单栏图标旁滚动显示当前这句歌词" disabled={!desktop || !s.showTray}>
                <Switch checked={s.trayLyrics} onChange={set('trayLyrics')} label="菜单栏歌词" disabled={!desktop || !s.showTray} />
              </Row>
            )}
            {isMac() && (
              <Row title="菜单栏文字颜色" description="菜单栏随壁纸变深时用白色；“跟随系统”在系统深色模式下用白色、浅色模式下用黑色" disabled={!desktop || !s.showTray || !s.trayLyrics}>
                <Segmented value={s.menuBarText} onChange={set('menuBarText')} label="菜单栏文字颜色" options={[{ value: 'white', label: '白色' }, { value: 'black', label: '黑色' }, { value: 'auto', label: '跟随系统' }]} />
              </Row>
            )}
            <Row title="窗口标题显示歌曲" description="任务栏、程序坞窗口列表和切换窗口时显示正在播放的歌曲">
              <Switch checked={s.titleShowsTrack} onChange={set('titleShowsTrack')} label="窗口标题显示歌曲" />
            </Row>
            <Row title="切歌通知" description="窗口不在前台时，切换歌曲显示一条提示">
              <Switch checked={s.toastOnTrackChange} onChange={set('toastOnTrackChange')} label="切歌通知" />
            </Row>
          </Section>

          {/* ───────── 关于 ───────── */}
          <Section id="about" icon={<Info size={17} strokeWidth={1.6} />} title="关于">
            <div className={styles.about}>
              <img src="/images/logo.svg?v=double-c-white-rounded" alt="" width={52} height={52} />
              <div>
                <strong>CoCo Music</strong>
                <span>{app.result ? `版本 ${app.result.info.version}${app.result.info.packaged ? '' : '（开发模式）'}` : '网页预览模式'}</span>
              </div>
            </div>
            {app.result && (
              <dl className={styles.facts}>
                <div><dt>系统</dt><dd>{({ darwin: 'macOS', win32: 'Windows', linux: 'Linux' } as Record<string, string>)[app.result.info.platform] ?? app.result.info.platform} · {app.result.info.arch}</dd></div>
                <div><dt>Electron</dt><dd>{app.result.info.electron}</dd></div>
                <div><dt>Chromium</dt><dd>{app.result.info.chrome}</dd></div>
                <div><dt>Node.js</dt><dd>{app.result.info.node}</dd></div>
              </dl>
            )}
            <Row title={<span className={styles.speaker}><MonitorSpeaker size={14} strokeWidth={1.6} />开源许可</span>} description="本项目采用 GPL-3.0 许可；音乐内容版权归各平台及权利人所有">
              <Button onClick={() => window.open('https://github.com/markcxx/cocomusic', '_blank', 'noopener')}>GitHub</Button>
            </Row>
          </Section>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'recent'}
        onClose={() => setConfirm(null)}
        title="清空最近播放"
        tone="danger"
        confirmLabel="清空"
        message="将删除本机上的全部播放记录。"
        onConfirm={() => { recentPlays.clear(); toast.info('播放记录已清空'); }}
      />
      <ConfirmDialog
        open={confirm === 'all'}
        onClose={() => setConfirm(null)}
        title="恢复全部默认设置"
        confirmLabel="恢复"
        message="外观、播放、歌词、桌面歌词、迷你模式和快捷键设置将回到初始状态。"
        onConfirm={() => { settings.reset(); toast.success('已恢复默认设置'); }}
      />
    </Page>
  );
}

