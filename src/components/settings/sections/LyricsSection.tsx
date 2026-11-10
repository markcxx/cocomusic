'use client';

import { Sparkles, Type } from 'lucide-react';
import { usePlayer } from '@/components/player/player-store';
import { pickTemplate, TEMPLATES } from '@/components/player/visualizer/VisualizerPicker';
import { Button } from '@/components/ui';
import { needsSamples, settings, useSettings } from '@/lib/settings';
import { ThemeColorControl } from '../ColorPicker';
import { Range, Row, Section, Segmented, Select, Switch } from '../controls';
import { keysOf, setter } from '../shared';

/** Quick picks next to the custom visualizer colour (the full picker is one click away). */
const VISUALIZER_COLOR_PRESETS = [
  { label: '湖光蓝', color: '#56a8ff' },
  { label: '薄荷', color: '#5fe0b8' },
  { label: '樱粉', color: '#ff8fc4' },
  { label: '暖橙', color: '#ffb065' },
  { label: '丁香紫', color: '#b79bff' },
];

/** 设置 › 歌词页 */
export function LyricsSection() {
  const s = useSettings();
  const player = usePlayer();
  return (
    <Section id="lyrics" icon={<Type size={17} strokeWidth={1.6} />} title="歌词页" description="全屏歌词的字号、翻译与背景" onReset={() => settings.reset(keysOf('lyricsFontSize', 'lyricsShowTranslation', 'lyricsBlurInactive', 'lyricsAlign', 'lyricsBackground', 'lyricsOffset', 'lyricsSpinCover', 'lyricsKeepAwake', 'lyricsLayout', 'lyricsVisualizer', 'lyricsVinylEffect', 'lyricsVisualizerColor', 'lyricsVisualizerCustomColor'))}>
      <Row title="歌词字号">
        <Range value={s.lyricsFontSize} min={14} max={32} onChange={setter('lyricsFontSize')} label="歌词字号" format={value => `${value}px`} />
      </Row>
      <Row title="显示翻译" description="有翻译的歌曲在原文下方显示译文">
        <Switch checked={s.lyricsShowTranslation} onChange={setter('lyricsShowTranslation')} label="显示翻译" />
      </Row>
      <Row title="对齐方式">
        <Segmented value={s.lyricsAlign} onChange={setter('lyricsAlign')} label="对齐方式" options={[{ value: 'left', label: '左对齐' }, { value: 'center', label: '居中' }]} />
      </Row>
      <Row title="景深效果" description="模糊非当前行，让视线聚焦在正在演唱的歌词上">
        <Switch checked={s.lyricsBlurInactive} onChange={setter('lyricsBlurInactive')} label="景深效果" />
      </Row>
      <Row title="背景">
        <Segmented value={s.lyricsBackground} onChange={setter('lyricsBackground')} label="背景" options={[{ value: 'cover', label: '封面模糊' }, { value: 'plain', label: '纯色' }]} />
      </Row>
      <Row title="唱片封面" description="封面显示为旋转的唱片">
        <Switch checked={s.lyricsSpinCover} onChange={setter('lyricsSpinCover')} label="唱片封面" />
      </Row>
      <Row title="布局" description="也可在歌词页右上角的「播放器模式」卡片中切换">
        <Segmented value={s.lyricsLayout} onChange={setter('lyricsLayout')} label="布局" options={[{ value: 'standard', label: '标准' }, { value: 'centered', label: '居中' }, { value: 'lyrics', label: '歌词' }]} />
      </Row>
      <Row title="播放器模式" description="歌词页的音频可视化与 3D 歌词效果，也可在歌词页右上角预览和切换">
        <Select
          value={s.lyricsVisualizer}
          onChange={value => pickTemplate(s.lyricsVisualizer, value, player.reloadStream)}
          label="播放器模式"
          options={[{ value: 'off', label: '关闭' }, ...TEMPLATES]}
        />
      </Row>
      <Row title="经典唱片搭配" description="经典唱片下方同时显示的频谱效果" disabled={s.lyricsVisualizer !== 'vinyl'}>
        <Segmented value={s.lyricsVinylEffect} onChange={value => pickTemplate(s.lyricsVisualizer, s.lyricsVisualizer, player.reloadStream, value)} label="经典唱片搭配" options={[{ value: 'none', label: '无' }, { value: 'lines', label: '细线频谱' }, { value: 'glow', label: '柔光波' }]} />
      </Row>
      <Row title="播放器模式配色" disabled={!needsSamples(s.lyricsVisualizer, s.lyricsVinylEffect)}>
        <Segmented value={s.lyricsVisualizerColor} onChange={setter('lyricsVisualizerColor')} label="播放器模式配色" options={[{ value: 'blue', label: '湖光蓝' }, { value: 'cover', label: '跟随封面' }, { value: 'white', label: '月光白' }, { value: 'accent', label: '主题色' }, { value: 'aurora', label: '极光' }, { value: 'custom', label: '自定义' }]} />
      </Row>
      {s.lyricsVisualizerColor === 'custom' && (
        <Row title="自定义颜色" description="选一个你喜欢的颜色，也可以用吸管从屏幕取色" disabled={!needsSamples(s.lyricsVisualizer, s.lyricsVinylEffect)}>
          <ThemeColorControl value={s.lyricsVisualizerCustomColor} presets={VISUALIZER_COLOR_PRESETS} onChange={setter('lyricsVisualizerCustomColor')} label="自定义颜色" />
        </Row>
      )}
      <Row title="歌词偏移" description="歌词总是快或慢时微调，桌面歌词和迷你模式同样生效">
        <Range value={s.lyricsOffset} min={-3} max={3} step={0.1} onChange={value => settings.set('lyricsOffset', Math.round(value * 10) / 10)} label="歌词偏移" format={value => (value === 0 ? '0 秒' : `${value > 0 ? '提前' : '延后'} ${Math.abs(value).toFixed(1)} 秒`)} />
      </Row>
      <Row title="保持屏幕常亮" description="歌词页打开并正在播放时，阻止屏幕自动熄灭">
        <Switch checked={s.lyricsKeepAwake} onChange={setter('lyricsKeepAwake')} label="保持屏幕常亮" />
      </Row>
      <Row title="预览">
        <Button icon={<Sparkles size={15} strokeWidth={1.5} />} onClick={player.openLyrics} disabled={!player.track.songId && !player.track.localId}>打开歌词页</Button>
      </Row>
    </Section>
  );
}
