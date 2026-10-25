import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useInfiniteList, type InfiniteState } from './hooks.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

test('pagination reports errors, retries the same offset and prevents duplicate in-flight calls', async () => {
  let list!: InfiniteState<number>;
  let fail = true;
  const offsets: number[] = [];
  const load = async (offset: number) => {
    offsets.push(offset);
    if (offset && fail) throw new Error('network unavailable');
    return { items: offset ? [2] : [1], total: 2, hasMore: !offset };
  };
  function Probe() { list = useInfiniteList('songs', load); return null; }
  let root!: ReactTestRenderer;
  try {
    await act(async () => { root = create(createElement(Probe)); });
    await act(async () => { list.loadMore(); list.loadMore(); });
    assert.deepEqual(offsets, [0, 1]);
    assert.deepEqual(list.items, [1]);
    assert.equal(list.hasMore, true);
    assert.match(list.error, /network unavailable/);
    fail = false;
    await act(async () => { list.retry(); });
    assert.deepEqual(offsets, [0, 1, 1]);
    assert.deepEqual(list.items, [1, 2]);
    assert.equal(list.error, '');
    assert.equal(list.hasMore, false);
  } finally { if (root) await act(async () => root.unmount()); }
});

test('changing the list or unmounting aborts an outstanding next-page request', async () => {
  let list!: InfiniteState<number>;
  let signal!: AbortSignal;
  let reject!: (error: Error) => void;
  const load = (offset: number, current: AbortSignal) => {
    if (!offset) return Promise.resolve({ items: [1], total: 2, hasMore: true });
    signal = current;
    return new Promise<{ items: number[]; total: number; hasMore: boolean }>((_, no) => { reject = no; });
  };
  function Probe({ name }: { name: string }) { list = useInfiniteList(name, load); return null; }
  let root!: ReactTestRenderer;
  try {
    await act(async () => { root = create(createElement(Probe, { name: 'old' })); });
    await act(async () => { list.loadMore(); });
    await act(async () => { root.update(createElement(Probe, { name: 'new' })); });
    assert.equal(signal.aborted, true);
    await act(async () => reject(new Error('late failure')));
    assert.equal(list.error, '');
    await act(async () => { list.loadMore(); });
    await act(async () => root.unmount());
    assert.equal(signal.aborted, true);
    await act(async () => reject(new Error('unmounted')));
  } finally { if (root) await act(async () => root.unmount()); }
});
