'use client';

import { Command, FastForward, Keyboard } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { settings, useSettings } from '@/lib/settings';
import { ChoiceExpander, Row, Section, Switch } from '../controls';
import { isDesktop, isMac, keysOf, setter, type AppSettings } from '../shared';
import styles from '../Settings.module.css';

const mod = () => (isMac() ? '⌘' : 'Ctrl');
const accelerator = (value: string) => value
  .replace('CommandOrControl', isMac() ? '⌘' : 'Ctrl')
  .replace('Alt', isMac() ? '⌥' : 'Alt')
  .replace(/Right$/, '→').replace(/Left$/, '←').replace(/Up$/, '↑').replace(/Down$/, '↓')
  .split('+').join(isMac() ? '' : ' + ');

function Kbd({ children }: { children: string }) {
  return <span className={styles.kbd}>{children}</span>;
}

/** 设置 › 快捷键 */
export function ShortcutsSection({ app }: { app: AppSettings }) {
  const s = useSettings();
  const desktop = isDesktop();
  const conflicts = useMemo(() => app.result?.shortcuts.filter(item => item.conflict) ?? [], [app.result]);
  return (
    <Section id="shortcuts" icon={<Keyboard size={17} strokeWidth={1.6} />} title="快捷键" description="应用内快捷键与系统全局快捷键" onReset={() => settings.reset(keysOf('appShortcuts', 'seekStep'))}>
      <Row icon={<Keyboard size={16} strokeWidth={1.5} />} title="应用内快捷键" description="窗口处于前台时生效">
        <Switch checked={s.appShortcuts} onChange={setter('appShortcuts')} label="应用内快捷键" />
      </Row>
      <div className={cn(styles.shortcuts, !s.appShortcuts && styles.rowDisabled)}>
        {[['播放 / 暂停', 'Space'], ['上一首', `${mod()} ←`], ['下一首', `${mod()} →`], ...(s.seekStep ? [[`快退 ${s.seekStep} 秒`, '←'], [`快进 ${s.seekStep} 秒`, '→']] : []), ['音量加', `${mod()} ↑`], ['音量减', `${mod()} ↓`], ['关闭歌词页 / 弹窗', 'Esc']].map(([label, key]) => (
          <div key={label} className={styles.shortcut}><span>{label}</span><Kbd>{key}</Kbd></div>
        ))}
      </div>
      <ChoiceExpander icon={<FastForward size={16} strokeWidth={1.5} />} title="快进快退" description="按 ← / → 在当前歌曲内跳转的秒数" disabled={!s.appShortcuts} value={s.seekStep} onChange={setter('seekStep')} label="快进快退" options={[{ value: 0, label: '关闭' }, { value: 5, label: '5 秒' }, { value: 10, label: '10 秒' }, { value: 15, label: '15 秒' }, { value: 30, label: '30 秒' }]} />
      <Row
        icon={<Command size={16} strokeWidth={1.5} />}
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
  );
}
