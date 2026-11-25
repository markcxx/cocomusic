import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('QQ favorite writes renew stale credentials once, then request QR login if needed', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'coco-qq-favorite-'));
  process.env.COCO_DATA_DIR = dir;
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const require = createRequire(import.meta.url);
  const { qqAccount } = require('./account') as typeof import('./account');
  const { session } = require('../session') as typeof import('../session');
  const calls: string[] = [];
  let rejectNewKey = false;
  let switchAccount = false;
  const song = 'testMid.10';
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    const bytes = Buffer.from(String(init.body), 'base64');
    const decoder = createDecipheriv('aes-128-gcm', Buffer.from('bd305f10d0ff74b6ef54dab835b5e1cf', 'hex'), bytes.subarray(0, 12));
    decoder.setAuthTag(bytes.subarray(-16));
    const { req_0, comm } = JSON.parse(Buffer.concat([decoder.update(bytes.subarray(12, -16)), decoder.final()]).toString());
    calls.push(req_0.method);
    let code = 0;
    let data;
    if (req_0.method === 'Login') {
      if (switchAccount) session.set('qq', { uin: '456', qm_keyst: 'other' });
      data = { musickey: 'new' };
    } else {
      code = comm.authst === 'new' && !rejectNewKey ? 0 : 80105;
      data = { retCode: 0 };
    }
    const key = Buffer.from('7a3f8c1d5e9b2f0a6c4d7e8b1f3a5c9d0e2b6f4a81', 'hex');
    const json = Buffer.from(JSON.stringify({ code: 0, req_0: { code, data } }));
    return new Response(Uint8Array.from(json, (b, i) => b ^ key[i % key.length]));
  });
  const staleLogin = () => session.set('qq', { uin: '123', qm_keyst: 'old', refresh_key: 'refresh' });
  staleLogin();
  await qqAccount.likeSong(song, true);
  assert.deepEqual(calls.splice(0), ['AddSonglist', 'Login', 'AddSonglist']);
  await qqAccount.likeSong(song, true);
  assert.deepEqual(calls.splice(0), ['AddSonglist']);

  staleLogin();
  rejectNewKey = true;
  await assert.rejects(qqAccount.likeSong(song, false), { status: 401, code: 80105 });
  assert.deepEqual(calls.splice(0), ['DelSonglist', 'Login', 'DelSonglist']);

  staleLogin();
  switchAccount = true;
  await assert.rejects(qqAccount.likeSong(song, true));
  assert.deepEqual(calls, ['AddSonglist', 'Login']);
  assert.equal(session.get('qq')?.cookie.qm_keyst, 'other');
});
