'use client';

import { AppWindow } from 'lucide-react';
import { useSettings } from '@/lib/settings';
import { Row, Section, Segmented, Switch } from '../controls';
import { isDesktop, isMac, setter, type AppSettings } from '../shared';

/** 设置 › 系统 */
export function SystemSection({ app }: { app: AppSettings }) {
  const s = useSettings();
  const desktop = isDesktop();
  const loginSupported = app.result?.info.loginItemSupported;
  return (
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
        <Switch checked={s.showTray} onChange={setter('showTray')} label={isMac() ? '菜单栏图标' : '系统托盘图标'} disabled={!desktop} />
      </Row>
      {isMac() && (
        <Row title="菜单栏歌词" description="播放时在菜单栏图标旁滚动显示当前这句歌词" disabled={!desktop || !s.showTray}>
          <Switch checked={s.trayLyrics} onChange={setter('trayLyrics')} label="菜单栏歌词" disabled={!desktop || !s.showTray} />
        </Row>
      )}
      {isMac() && (
        <Row title="菜单栏文字颜色" description="菜单栏随壁纸变深时用白色；“跟随系统”在系统深色模式下用白色、浅色模式下用黑色" disabled={!desktop || !s.showTray || !s.trayLyrics}>
          <Segmented value={s.menuBarText} onChange={setter('menuBarText')} label="菜单栏文字颜色" options={[{ value: 'white', label: '白色' }, { value: 'black', label: '黑色' }, { value: 'auto', label: '跟随系统' }]} />
        </Row>
      )}
      <Row title="窗口标题显示歌曲" description="任务栏、程序坞窗口列表和切换窗口时显示正在播放的歌曲">
        <Switch checked={s.titleShowsTrack} onChange={setter('titleShowsTrack')} label="窗口标题显示歌曲" />
      </Row>
      <Row title="切歌通知" description="窗口不在前台时，切换歌曲显示一条提示">
        <Switch checked={s.toastOnTrackChange} onChange={setter('toastOnTrackChange')} label="切歌通知" />
      </Row>
    </Section>
  );
}
