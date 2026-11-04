import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dailyCheckIn } from './auto-check-in';

test('successful daily check-in survives coordinator restarts and uses China dates per account', async () => {
  let state = {};
  let now = new Date('2026-11-04T15:59:00Z');
  let calls = 0;
  const deps = { read: () => state, save: (next: typeof state) => { state = next; }, claim: async () => { calls++; }, now: () => now };
  assert.equal((await dailyCheckIn(deps)('a')).status, 'success');
  assert.equal((await dailyCheckIn(deps)('a')).status, 'already-done');
  assert.equal(calls, 1);
  await dailyCheckIn(deps)('b'); assert.equal(calls, 2);
  now = new Date('2026-11-04T16:01:00Z');
  const next = await dailyCheckIn(deps)('a');
  assert.equal(next.day, '2026-11-05'); assert.equal(next.status, 'success'); assert.equal(calls, 3);
});

test('concurrent startup and focus checks issue only one claim', async () => {
  let state = {};
  let calls = 0;
  const run = dailyCheckIn({ read: () => state, save: next => { state = next; }, claim: async () => { calls++; await new Promise(resolve => setImmediate(resolve)); } });
  const [a, b] = await Promise.all([run('a'), run('a')]);
  assert.deepEqual(a, b); assert.equal(calls, 1);
});

test('verification failures stay failed, have a retry cooldown, and can succeed later', async () => {
  let state = {};
  let now = new Date('2026-11-04T01:00:00Z');
  let calls = 0;
  const run = dailyCheckIn({ read: () => state, save: next => { state = next; }, now: () => now, claim: async () => { calls++; if (calls === 1) throw new Error('需要账号验证'); } });
  assert.equal((await run('a')).status, 'failed');
  assert.equal((await run('a')).status, 'retry-later'); assert.equal(calls, 1);
  now = new Date('2026-11-04T01:11:00Z');
  assert.equal((await run('a')).status, 'success'); assert.equal(calls, 2);
});

test('explicit retry after manual verification can retry a failed claim but never a successful day', async () => {
  let state = {};
  let calls = 0;
  const run = dailyCheckIn({ read: () => state, save: next => { state = next; }, claim: async () => { calls++; if (calls === 1) throw new Error('需要验证'); } });
  assert.equal((await run('a')).status, 'failed');
  assert.equal((await run('a', true)).status, 'success');
  assert.equal((await run('a', true)).status, 'already-done');
  assert.equal(calls, 2);
});
