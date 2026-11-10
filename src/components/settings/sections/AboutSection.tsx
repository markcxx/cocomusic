'use client';

import { Info, MonitorSpeaker } from 'lucide-react';
import { Button } from '@/components/ui';
import { Row, Section } from '../controls';
import { type AppSettings } from '../shared';
import styles from '../Settings.module.css';

/** 设置 › 关于 */
export function AboutSection({ app }: { app: AppSettings }) {
  return (
    <Section id="about" icon={<Info size={17} strokeWidth={1.6} />} title="关于">
      <div className={styles.about}>
        <img src="/images/logo.svg?v=wisteria-v1" alt="" width={52} height={52} />
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
  );
}
