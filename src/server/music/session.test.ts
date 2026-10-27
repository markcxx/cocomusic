import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
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
