'use client';

import { CalendarCheck, Disc3, Globe, UserRound } from 'lucide-react';
import { useAccount } from '@/components/account/account-store';
import { ConceptMembership } from '@/components/account/ConceptMembership';
import { Button } from '@/components/ui';
import { useSettings } from '@/lib/settings';
import { ChoiceExpander, Row, Section, Switch } from '../controls';
import { setter } from '../shared';

const PLATFORMS = [
  { value: 'netease', label: '网易云音乐' },
  { value: 'qq', label: 'QQ 音乐' },
  { value: 'kugou', label: '酷狗音乐' },
  { value: 'kugou-lite', label: '酷狗概念版' },
] as const;

/** 设置 › 曲库 */
export function CatalogSection() {
  const s = useSettings();
  const account = useAccount();
  return (
    <Section id="catalog" icon={<Disc3 size={17} strokeWidth={1.6} />} title="曲库" description="选择浏览、搜索和登录所使用的音乐平台">
      <ChoiceExpander variant="select" icon={<Globe size={16} strokeWidth={1.5} />} title="音乐平台" description="首页、发现、排行榜、搜索和账号都会切换到所选平台；播放列表中已有的歌曲仍从原平台播放" value={s.catalogSource} onChange={setter('catalogSource')} label="音乐平台" options={[...PLATFORMS]} />
      <Row
        icon={<UserRound size={16} strokeWidth={1.5} />}
        title="账号"
        description={account.profile
          ? `已登录${PLATFORMS.find(item => item.value === s.catalogSource)?.label}：${account.profile.nickname}。每个平台的登录状态分别保存`
          : '每个平台的登录状态分别保存，切换平台后需要登录对应平台的账号'}
      >
        {account.profile
          ? <Button variant="ghost" onClick={() => void account.logout()}>退出登录</Button>
          : <Button onClick={account.openLogin} disabled={account.profile === undefined}>登录</Button>}
      </Row>
      {s.catalogSource === 'kugou-lite' && <Row icon={<CalendarCheck size={16} strokeWidth={1.5} />} title="每天打开时自动签到" description="使用已保存的概念版账号，每天首次打开或返回应用时领取今日权益；成功后当天不再重复。失败时会提示，可手动重试">
        <Switch checked={s.conceptAutoCheckIn} onChange={setter('conceptAutoCheckIn')} label="酷狗概念版自动签到" />
      </Row>}
      {s.catalogSource === 'kugou-lite' && account.profile?.source === 'kugou-lite' && <ConceptMembership key={account.profile.id} userId={account.profile.id} />}
    </Section>
  );
}
