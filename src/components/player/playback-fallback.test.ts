import assert from 'node:assert/strict';
import test from 'node:test';
import { CatalogRequestError } from '@/lib/catalog-client';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import type { CatalogSource, CatalogTrack, SongSource } from '@/server/music/types';
import type { Track } from '@/types/music';
import { findAlternate, matchRecording, resolvePlayback, type Alternate } from './playback-fallback';

const track: Track = { id: 'netease:1', songId: '1', source: 'netease', title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, coverSeed: '1', vip: true };
const match: CatalogTrack = { ...track, id: 'other', source: 'qq' };
const full: SongSource = { id: '1', url: 'original-stream' };
const clip: SongSource = { ...full, url: 'preview', trial: { start: 30, end: 60 } };
const other: Alternate = { platform: 'qq', stream: { id: 'other', url: 'alternate' } };
const unavailable = new CatalogRequestError('没有播放权益', 403, undefined, undefined, true);
const signal = new AbortController().signal;

test('match requires title, artists, duration and compatible recording version', () => {
  for (const candidate of [{ ...match, duration: 274 }, { ...match, title: '晴天 (Live)' }, { ...match, album: '演唱会 Live' }, { ...match, artist: '其他歌手' }]) {
    assert.equal(matchRecording(track, [candidate]), undefined);
  }
  assert.equal(matchRecording({ ...track, duration: undefined }, [match]), undefined);
  assert.equal(matchRecording(track, [match, { ...match, id: 'duplicate' }]), undefined);
  assert.equal(matchRecording(track, [{ ...match, id: 'compilation', album: '精选' }, match]), match);
  assert.equal(matchRecording(track, [{ ...match, duration: 272 }])?.id, 'other');
});

function playback(original: SongSource | Error, fallbackUnavailable = true, fallbackTrial = true) {
  const events: string[] = [];
  const api = {
    settings: { get: () => ({ fallbackUnavailable, fallbackTrial, fallbackPlatform: 'auto' as const }), subscribe: () => () => undefined },
    original: async () => { events.push('original'); if (original instanceof Error) throw original; return original; },
    alternate: async (): Promise<Alternate | undefined> => { events.push('lookup'); return other; },
  };
  const play = (s: SongSource, _platform?: CatalogSource, continuingPreview?: boolean) => {
    events.push(continuingPreview ? 'continue:' + s.url : s.url);
  };
  return { events, api, run: (cached: SongSource | null = null, owner = signal) => resolvePlayback(track, 'standard', cached, owner, play, api) };
}

test('both rules default off; even a VIP-tagged track always uses its original full stream', async () => {
  assert.equal(DEFAULT_SETTINGS.fallbackTrial, false);
  assert.equal(DEFAULT_SETTINGS.fallbackUnavailable, false);
  for (const cached of [null, full, clip]) {
    const p = playback(full);
    await p.run(cached);
    assert.deepEqual(p.events, cached === full ? [full.url] : ['original', full.url]);
  }
});

test('rules are independent; ordinary errors never initiate a lookup', async () => {
  const trialOnly = playback(unavailable, false, true);
  await assert.rejects(trialOnly.run(), unavailable);
  assert.deepEqual(trialOnly.events, ['original']);
  const greyOnly = playback(clip, true, false);
  await greyOnly.run();
  assert.deepEqual(greyOnly.events, ['original', 'preview']);
  for (const error of [new Error('network'), new CatalogRequestError('登录失效', 401), new CatalogRequestError('验证', 403, 20028), new CatalogRequestError('未知错误', 404)]) {
    const p = playback(error);
    await assert.rejects(p.run(), error);
    assert.deepEqual(p.events, ['original']);
  }
});

test('a failed network refresh keeps the warmed preview without starting a search', async () => {
  const p = playback(new CatalogRequestError('请求超时', 504));
  await p.run(clip);
  assert.deepEqual(p.events, ['original', 'preview']);
});

test('turning the preview rule off during lookup discards the pending alternate', async () => {
  let enabled = true;
  let listener: (() => void) | undefined;
  const p = playback(clip);
  const deferred = Promise.withResolvers<Alternate>();
  const api = {
    ...p.api,
    alternate: () => deferred.promise,
    settings: {
      get: () => ({ fallbackTrial: enabled, fallbackUnavailable: true, fallbackPlatform: 'auto' as const }),
      subscribe: (fn: () => void) => { listener = fn; return () => { listener = undefined; }; },
    },
  };
  const done = resolvePlayback(track, 'standard', null, signal, source => { p.events.push(source.url); }, api);
  await Promise.resolve();
  enabled = false;
  listener!();
  deferred.resolve(other);
  await done;
  assert.deepEqual(p.events, ['original', 'preview']);
});

test('an early full match replaces a preview or an explicitly unavailable original', async () => {
  for (const source of [clip, unavailable]) {
    const p = playback(source);
    await p.run();
    assert.deepEqual(p.events, ['original', 'lookup', 'alternate']);
  }
});

test('a failed lookup preserves the original preview or error', async () => {
  for (const source of [clip, unavailable]) {
    const p = playback(source);
    p.api.alternate = async () => { throw new Error('timeout'); };
    if (source === unavailable) await assert.rejects(p.run(), unavailable);
    else { await p.run(); assert.deepEqual(p.events, ['original', 'preview']); }
  }
});

test('a late full stream automatically continues the playing preview', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const p = playback(clip);
  const deferred = Promise.withResolvers<Alternate>();
  p.api.alternate = () => deferred.promise;
  const done = p.run();
  await Promise.resolve();
  t.mock.timers.tick(1200);
  assert.deepEqual(p.events, ['original', 'preview']);
  deferred.resolve(other);
  await done;
  assert.deepEqual(p.events, ['original', 'preview', 'continue:alternate']);
});

test('changing tracks discards a late answer', async () => {
  const owner = new AbortController();
  const p = playback(clip);
  const deferred = Promise.withResolvers<Alternate>();
  p.api.alternate = () => deferred.promise;
  const done = p.run(null, owner.signal);
  await Promise.resolve();
  owner.abort();
  deferred.resolve(other);
  await assert.rejects(done, { name: 'AbortError' });
  assert.deepEqual(p.events, ['original']);
});

test('manual preference is tried first; auto ranks confirmed membership, breaking ties with Concept', async () => {
  for (const [preferred, members, expected] of [
    ['qq', ['kugou-lite'], 'qq'], ['auto', ['qq'], 'qq'], ['auto', ['kugou-lite', 'qq'], 'kugou-lite'],
  ] as const) {
    const queried: CatalogSource[] = [];
    const api = {
      entitlement: async (source: CatalogSource) => members.some(m => m === source),
      search: async (_q: string, _t: string, _o?: number, _l?: number, _s?: AbortSignal, source?: CatalogSource) => {
        queried.push(source!);
        return { type: 'song' as const, items: [{ ...match, source: source! }], total: 1, hasMore: false };
      },
      stream: async () => full,
    };
    assert.equal((await findAlternate(track, 'standard', preferred, signal, api))?.platform, expected);
    assert.deepEqual(queried, [expected]);
  }
});

test('a preferred platform returning a trial is skipped; the original is never retried as an alternate', async () => {
  const tried: CatalogSource[] = [];
  const result = await findAlternate(track, 'standard', 'qq', signal, {
    entitlement: async () => false,
    search: async (_q, _t, _o, _l, _s, source) => ({
      type: 'song', items: [{ ...match, source: source! }], total: 1, hasMore: false,
    }),
    stream: async (_id, _s, _q, source) => { tried.push(source!); return source === 'kugou' ? full : clip; },
  });
  assert.deepEqual(tried, ['qq', 'kugou-lite', 'kugou']);
  assert.equal(result?.platform, 'kugou');
});
