'use client';

import { Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '@/components/account/account-store';
import { ErrorState } from '@/components/common/AsyncState';
import { SongTable } from '@/components/music/SongTable';
import { usePlayer } from '@/components/player/player-store';
import { CollapsingHeader, Page } from '@/components/scroll';
import { Button } from '@/components/ui';
import { catalogApi, useCatalog } from '@/lib/catalog-client';
import { useSettings } from '@/lib/settings';
import { toTrack } from '@/lib/to-track';
import { SOURCE_NAMES } from '@/server/music/ids';
import type { CatalogSource } from '@/server/music/types';

export const dailySongsTitle = (source: CatalogSource) => source === 'qq' ? '每日30首' : '每日推荐歌曲';

export function useRecommendationDay() {
  const [day, setDay] = useState(() => new Date().toDateString());
  useEffect(() => {
    const refreshDay = () => setDay(new Date().toDateString());
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const timer = setTimeout(refreshDay, midnight.getTime() - Date.now());
    window.addEventListener('focus', refreshDay);
    return () => { clearTimeout(timer); window.removeEventListener('focus', refreshDay); };
  }, [day]);
  return day;
}

export function DailySongs() {
  const { profile, openLogin } = useAccount();
  const player = usePlayer();
  const source = useSettings().catalogSource;
  const accountId = profile?.source === source ? profile.id : undefined;
  const day = useRecommendationDay();
  const result = useCatalog(signal => accountId ? catalogApi.dailySongs(signal) : Promise.resolve({ tracks: [] }), `daily-songs:${accountId ?? ''}:${day}`);
  const tracks = useMemo(() => (result.data?.tracks ?? []).map(toTrack), [result.data]);
  const loading = profile === undefined || (Boolean(accountId) && result.loading);
  const subtitle = loading ? '正在加载…' : !accountId ? `登录${SOURCE_NAMES[source]}后查看` : result.error ? '每日推荐加载失败' : `今日推荐 · ${tracks.length} 首`;
  const action = accountId || loading
    ? <Button variant="primary" icon={<Play size={14} fill="currentColor" />} disabled={!tracks.length} onClick={() => player.play(tracks[0], tracks)}>播放全部</Button>
    : <Button onClick={openLogin}>登录{SOURCE_NAMES[source]}</Button>;

  return (
    <Page>
      <CollapsingHeader title={dailySongsTitle(source)} subtitle={subtitle} actions={action} />
      {result.error ? <ErrorState message={result.error} onRetry={result.retry} />
        : (loading || accountId) && <SongTable tracks={tracks} loading={loading} emptyText="今天暂无推荐歌曲" />}
    </Page>
  );
}
