import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACCOUNT_RECHECK_EVENT, accountRecheckMatches } from './account-events';
import { accountApi, AccountError } from './account-client';
import { catalogApi, CatalogRequestError, setCatalogSource } from './catalog-client';

test('rejected account and song requests request a check of their own platform', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const target = new EventTarget();
  Object.defineProperty(globalThis, 'window', { value: target, configurable: true });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window'); });
  const events: Event[] = [];
  target.addEventListener(ACCOUNT_RECHECK_EVENT, event => events.push(event));
  setCatalogSource('kugou-lite');
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: '登录已失效' }, { status: 401 }));
  await assert.rejects(accountApi.playlists(), error => error instanceof AccountError && error.status === 401);
  assert.equal(events.length, 1);
  assert.equal(accountRecheckMatches(events[0], 'kugou-lite'), true);
  assert.equal(accountRecheckMatches(events[0], 'qq'), false);
  await assert.rejects(catalogApi.songSource('song', undefined, 'standard', 'qq'), error => error instanceof CatalogRequestError && error.status === 401);
  assert.equal(events.length, 2);
  assert.equal(accountRecheckMatches(events[1], 'qq'), true);
  assert.equal(accountRecheckMatches(events[1], 'kugou-lite'), false);
  // The check itself must not recursively request another check.
  await assert.rejects(accountApi.me());
  assert.equal(events.length, 2);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: '网络异常' }, { status: 502 }));
  await assert.rejects(accountApi.playlists());
  assert.equal(events.length, 2);
  assert.equal(accountRecheckMatches(new Event(ACCOUNT_RECHECK_EVENT), 'qq'), true);
});
