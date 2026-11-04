import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

const directory = mkdtempSync(path.join(os.tmpdir(), 'coco-concept-device-'));
process.env.COCO_DATA_DIR = directory;
after(() => rmSync(directory, { recursive: true, force: true }));
const require = createRequire(import.meta.url);
const { deviceCoordinator, conceptMid } = require('./device') as typeof import('./device');
type Device = import('./device').ConceptDevice;

test('MID uses the decimal MD5 value without rounding large integers', () => {
  const guid = 'installed-device';
  assert.equal(conceptMid(guid), BigInt(`0x${createHash('md5').update(guid).digest('hex')}`).toString());
  assert.match(conceptMid(guid), /^\d{30,39}$/);
});

test('concurrent initialization registers once; subsequent launches retain the registered identity', async () => {
  let stored: Device | null = null;
  let registrations = 0;
  const deps = {
    read: () => stored,
    save: (value: Device) => { stored = value; },
    installationId: () => 'same-installation',
    register: async () => { registrations++; await new Promise(resolve => setImmediate(resolve)); return 'official-dfid'; },
  };
  const first = deviceCoordinator(deps);
  const initial = first.current();
  await Promise.all([first.ensure(), first.ensure(), first.ensure()]);
  assert.equal(registrations, 1);
  assert.equal(first.current().guid, initial.guid);
  assert.equal(first.current().mid, initial.mid);
  assert.equal(first.current().dfid, 'official-dfid');
  const restarted = deviceCoordinator(deps);
  await restarted.ensure();
  assert.equal(registrations, 1);
  assert.deepEqual(restarted.current(), first.current());
});

test('failed registration neither reports success nor rotates the saved installation identity', async () => {
  let stored: Device | null = null;
  const first = deviceCoordinator({ read: () => stored, save: value => { stored = value; }, installationId: () => 'same-installation', register: async () => { throw new Error('unavailable'); } });
  const initial = first.current();
  await assert.rejects(first.ensure(), /unavailable/);
  assert.deepEqual(first.current(), initial);
  await assert.rejects(first.ensure(), /unavailable/);
  assert.deepEqual(first.current(), initial);
});

test('registration completes before catalog traffic and sends no logged-in user credentials', async t => {
  const { session } = require('../session') as typeof import('../session');
  const { createKugouClient } = require('./client') as typeof import('./client');
  session.set('kugou-lite', { userid: '202', token: 'private-token', dfid: '-' });
  const requests: URL[] = [];
  // An invalid encrypted reply must stop the original request, not continue
  // with placeholder identity or silently mark the device as registered.
  t.mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input); requests.push(url);
    assert.equal(url.pathname, '/risk/v3/r_register_dev');
    assert.equal(url.searchParams.has('token'), false);
    assert.equal(url.searchParams.get('userid'), '0');
    assert.match(url.searchParams.get('mid')!, /^\d+$/);
    assert.equal(url.searchParams.get('uuid'), '-');
    assert.equal(url.searchParams.get('p')?.length, 256);
    assert.equal(String(init?.body).includes('private-token'), false);
    return new Response(new Uint8Array([1, 2, 3]));
  });
  const client = createKugouClient('kugou-lite');
  const initial = client.device();
  await assert.rejects(client.kugouRequest({ path: '/catalog' }), /设备注册响应无法解析/);
  assert.equal(requests.length, 1);
  assert.equal(client.device().mid, initial.mid);
  assert.equal(client.device().dfid, '-');
});
