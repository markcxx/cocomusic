'use client';

import { Mic2 } from 'lucide-react';
import { settings, useSettings } from '@/lib/settings';
import { ThemeColorControl } from '../ColorPicker';
import { Range, Row, Section, Segmented, Switch } from '../controls';
import { keysOf, setter } from '../shared';

/** 设置 › 任务栏歌词 */
export function TaskbarLyricsSection() {
  const s = useSettings();
  return (
    <Section id="taskbar-lyrics" icon={<Mic2 size={17} strokeWidth={1.6} />} title="任务栏歌词" description="透明歌词融入任务栏，悬停时展开播放控制" onReset={() => settings.reset(keysOf('taskbarLyrics', 'taskbarWidth', 'taskbarPosition', 'taskbarFontSize', 'taskbarTranslation', 'taskbarCustomColors', 'taskbarTextColor', 'taskbarHighlightColor'))}>
      <Row title="显示任务栏歌词" description="跟随歌曲同步高亮；全屏、任务栏隐藏或空间不足时自动收起">
        <Switch checked={s.taskbarLyrics} onChange={setter('taskbarLyrics')} label="显示任务栏歌词" />
      </Row>
      <Row title="显示位置" description="自动从任务栏最左侧的可用位置显示，并避让小组件和应用按钮" disabled={!s.taskbarLyrics}>
        <Segmented value={s.taskbarPosition} onChange={setter('taskbarPosition')} label="任务栏歌词位置" options={[{ value: 'auto', label: '自动' }, { value: 'left', label: '左侧优先' }, { value: 'right', label: '右侧优先' }]} />
      </Row>
      <Row title="最大宽度" description="根据任务栏剩余空间自动缩小" disabled={!s.taskbarLyrics}>
        <Range value={s.taskbarWidth} min={180} max={560} step={10} onChange={setter('taskbarWidth')} label="任务栏歌词宽度" format={value => `${value} px`} />
      </Row>
      <Row title="歌词字号" disabled={!s.taskbarLyrics}>
        <Range value={s.taskbarFontSize} min={12} max={18} onChange={setter('taskbarFontSize')} label="任务栏歌词字号" format={value => `${value} px`} />
      </Row>
      <Row title="自定义歌词配色" description="关闭时随系统明暗使用柔和灰色文字与蓝色高亮" disabled={!s.taskbarLyrics}>
        <Switch checked={s.taskbarCustomColors} onChange={setter('taskbarCustomColors')} label="自定义任务栏歌词配色" disabled={!s.taskbarLyrics} />
      </Row>
      {s.taskbarCustomColors && <>
        <Row title="文字颜色" description="尚未唱到的歌词颜色" disabled={!s.taskbarLyrics}>
          <ThemeColorControl label="任务栏歌词文字颜色" value={s.taskbarTextColor} presets={[{ label: '柔灰', color: '#626771' }, { label: '浅灰', color: '#bfc4cc' }, { label: '纯白', color: '#ffffff' }, { label: '深灰', color: '#30343b' }]} onChange={setter('taskbarTextColor')} />
        </Row>
        <Row title="高亮颜色" description="随演唱进度填充的颜色" disabled={!s.taskbarLyrics}>
          <ThemeColorControl label="任务栏歌词高亮颜色" value={s.taskbarHighlightColor} presets={[{ label: '晴空蓝', color: '#0078d4' }, { label: '薰衣草', color: '#a799d4' }, { label: '薄荷', color: '#4fb797' }, { label: '暖橙', color: '#dd9b53' }]} onChange={setter('taskbarHighlightColor')} />
        </Row>
      </>}
      <Row title="显示翻译" description="有翻译时显示在第二行，其他情况显示歌名与歌手" disabled={!s.taskbarLyrics}>
        <Switch checked={s.taskbarTranslation} onChange={setter('taskbarTranslation')} label="任务栏歌词显示翻译" disabled={!s.taskbarLyrics} />
      </Row>
    </Section>
  );
}
