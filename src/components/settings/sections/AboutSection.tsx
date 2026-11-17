'use client';

import { Code2, Globe, Info, MessageSquare, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui';
import { Row, Section } from '../controls';
import type { AppSettings } from '../shared';
import styles from '../Settings.module.css';

const repository = 'https://github.com/markcxx/cocomusic';
const openExternal = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

/** 设置 › 关于 */
export function AboutSection({ app }: { app: AppSettings }) {
  return (
    <Section id="about" icon={<Info size={17} strokeWidth={1.6} />} title="关于">
      <div className={styles.about}>
        <div className={styles.aboutIdentity}>
          <img src="/images/logo.svg?v=wisteria-v1" alt="" width={52} height={52} />
          <div>
            <h3>CoCo Music</h3>
            <span className={styles.aboutVersion}>{app.result ? `版本 ${app.result.info.version}` : '网页预览版'}</span>
          </div>
        </div>
        <p>适用于 macOS、Windows 和 Linux 的开源音乐播放器。你可以把在线曲库和本地收藏中的歌曲加入同一张歌单，播放时在桌面查看同步歌词。</p>
        <Button variant="primary" icon={<Globe size={15} aria-hidden />} onClick={() => openExternal('https://cocomusic.cn')}>访问官网</Button>
      </div>
      <Row icon={<Code2 size={16} strokeWidth={1.5} />} title="项目开发" description="由 markcxx 开发与维护，源代码托管于 GitHub。">
        <Button onClick={() => openExternal(repository)}>查看源码</Button>
      </Row>
      <Row icon={<MessageSquare size={16} strokeWidth={1.5} />} title="问题与建议" description="在 GitHub Issues 报告使用问题或提出功能建议。">
        <Button onClick={() => openExternal(`${repository}/issues`)}>提交反馈</Button>
      </Row>
      <Row icon={<ScrollText size={16} strokeWidth={1.5} />} title="版权与许可" description={
        <>
          <span lang="en">Copyright © 2026 markcxx</span><br />
          软件采用 GPL-3.0-only 许可证。音乐内容版权归各自权利人所有。
        </>
      }>
        <Button onClick={() => openExternal(`${repository}/blob/HEAD/LICENSE`)}>查看许可</Button>
      </Row>
    </Section>
  );
}
