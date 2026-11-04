import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import type { session as Session } from './session';

// The store reads its folder at import time.
const dir = mkdtempSync(path.join(os.tmpdir(), 'coco-session-'));
process.env.COCO_DATA_DIR = dir;
after(() => rmSync(dir, { recursive: true, force: true }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { session } = require('./session') as { session: typeof Session };

test('a login rejected by the platform is reported once as expired', () => {
  session.set('qq', { uin: '1', qm_keyst: 'old' });
  session.clear('qq', { expired: true });
  assert.equal(session.get('qq'), undefined);
  assert.equal(session.takeExpired('qq'), true);
  assert.equal(session.takeExpired('qq'), false);
});

test('a user logout is not reported as expired', () => {
  session.set('kugou', { userid: '1', token: 't' });
  session.clear('kugou');
  assert.equal(session.takeExpired('kugou'), false);
});

test('logging in again clears a pending expired flag', () => {
  session.set('netease', { MUSIC_U: 'a' });
  session.clear('netease', { expired: true });
  session.set('netease', { MUSIC_U: 'b' });
  assert.equal(session.takeExpired('netease'), false);
});

test('refreshed credentials merge into the stored cookie, ignoring blanks', () => {
  session.set('qq', { uin: '1', qm_keyst: 'old', refresh_key: 'r1' });
  session.updateCookie('qq', { qm_keyst: 'new', refresh_key: '' });
  assert.deepEqual(session.get('qq')?.cookie, { uin: '1', qm_keyst: 'new', refresh_key: 'r1' });
});

test('new credentials written by another route instance are observed and survive unrelated profile updates', () => {
  session.set('kugou-lite', { userid: '1', token: 'old-token' });
  session.set('qq', { uin: '2', qm_keyst: 'qq-key' });
  const file = path.join(dir, 'sessions.json');
  const disk = JSON.parse(readFileSync(file, 'utf8'));
  disk.sessions['kugou-lite'].cookie.token = 'new-token';
  writeFileSync(file, JSON.stringify(disk));
  session.setProfile('qq', { id: '2', source: 'qq', nickname: 'QQ profile' });
  assert.equal(session.get('kugou-lite')?.cookie.token, 'new-token');
  const persisted = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(persisted.sessions['kugou-lite'].cookie.token, 'new-token');
});

test('a stale profile response cannot overwrite a newer authenticated session', () => {
  session.set('kugou-lite', { userid: '1', token: 'old-token' });
  const previous = session.get('kugou-lite')!;
  session.set('kugou-lite', { userid: '1', token: 'new-token' }, { id: '1', source: 'kugou-lite', nickname: 'new-profile' });
  assert.equal(session.setProfile('kugou-lite', { id: '1', source: 'kugou-lite', nickname: 'stale-profile' }, previous.cookie), false);
  assert.equal(session.get('kugou-lite')?.profile?.nickname, 'new-profile');
});
