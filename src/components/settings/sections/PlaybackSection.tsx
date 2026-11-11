'use client';

import { AudioLines, Crown, Gauge, Headphones, History, MousePointerClick, Play, RotateCcw, SkipForward, SlidersHorizontal, Speaker } from 'lucide-react';
import { useEffect, useState } from 'react';
import { settings, useSettings } from '@/lib/settings';
import { DependentSettings, ChoiceExpander, Range, Row, Section, Select, Switch } from '../controls';
import { keysOf, QUALITIES, setter } from '../shared';

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

/** 设置 › 播放 */
export function PlaybackSection() {
  const s = useSettings();
  const devices = useOutputDevices();
  return (
    <Section id="playback" icon={<Play size={17} strokeWidth={1.6} />} title="播放" description="音质、过渡、输出设备与续播" onReset={() => settings.reset(keysOf('quality', 'fadeMs', 'playbackRate', 'outputDevice', 'resumeOnLaunch', 'resumePosition', 'skipOnError', 'doubleClick', 'trialNotice', 'showVipBadge'))}>
      <ChoiceExpander variant="select" icon={<AudioLines size={16} strokeWidth={1.5} />} title="在线播放音质" description="更高音质需要账号有对应权限，不满足时会自动使用可用的最高音质" value={s.quality} onChange={setter('quality')} label="在线播放音质" options={QUALITIES} />
      <Row icon={<SlidersHorizontal size={16} strokeWidth={1.5} />} title="淡入淡出" description="播放、暂停时音量平滑过渡">
        <Range value={s.fadeMs} max={1500} step={100} onChange={setter('fadeMs')} label="淡入淡出" format={value => (value ? `${(value / 1000).toFixed(1)} 秒` : '关闭')} />
      </Row>
      <ChoiceExpander icon={<Gauge size={16} strokeWidth={1.5} />} title="播放速度" description="调整速度时保持原有音调" value={s.playbackRate} onChange={setter('playbackRate')} label="播放速度" options={[0.75, 1, 1.25, 1.5, 2].map(value => ({ value, label: `${value}×` }))} />
      <Row icon={<Speaker size={16} strokeWidth={1.5} />} title="输出设备" description={devices.length ? '选择用于播放的扬声器或耳机' : '未检测到其他输出设备，将使用系统默认设备'}>
        <Select
          value={s.outputDevice}
          onChange={setter('outputDevice')}
          label="输出设备"
          options={[{ value: '', label: '系统默认' }, ...devices.map((device, index) => ({ value: device.deviceId, label: device.label || `输出设备 ${index + 1}` }))]}
        />
      </Row>
      <ChoiceExpander icon={<MousePointerClick size={16} strokeWidth={1.5} />} title="双击歌曲" description="在歌单、排行榜等列表中双击一首歌时" value={s.doubleClick} onChange={setter('doubleClick')} label="双击歌曲" options={[{ value: 'replace', label: '播放整个列表' }, { value: 'insert', label: '仅插入这首' }]} />
      <Row icon={<RotateCcw size={16} strokeWidth={1.5} />} title="启动时恢复上次播放" description="打开应用时恢复播放列表和上次的歌曲（不会自动开始播放）">
        <Switch checked={s.resumeOnLaunch} onChange={setter('resumeOnLaunch')} label="启动时恢复上次播放" />
      </Row>
      <DependentSettings label="启动时恢复上次播放">
        <Row icon={<History size={16} strokeWidth={1.5} />} title="恢复播放进度" description="从上次停下的位置继续，而不是从头开始" disabled={!s.resumeOnLaunch}>
          <Switch checked={s.resumePosition} onChange={setter('resumePosition')} label="恢复播放进度" disabled={!s.resumeOnLaunch} />
        </Row>
      </DependentSettings>
      <Row icon={<SkipForward size={16} strokeWidth={1.5} />} title="播放失败时自动跳过" description="遇到无版权或无法播放的歌曲时自动播放下一首">
        <Switch checked={s.skipOnError} onChange={setter('skipOnError')} label="播放失败时自动跳过" />
      </Row>
      <Row icon={<Headphones size={16} strokeWidth={1.5} />} title="试听提示" description="只能播放试听片段时弹出提示">
        <Switch checked={s.trialNotice} onChange={setter('trialNotice')} label="试听提示" />
      </Row>
      <Row icon={<Crown size={16} strokeWidth={1.5} />} title="显示 VIP 标签" description="在歌曲列表中标出需要会员的歌曲">
        <Switch checked={s.showVipBadge} onChange={setter('showVipBadge')} label="显示 VIP 标签" />
      </Row>
    </Section>
  );
}
