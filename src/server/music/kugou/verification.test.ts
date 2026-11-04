import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kugouVerificationUrl } from './verification';

test('official verification links accept only SSA events and never embed signed request queries', () => {
  const event = 'gz_tx_event_' + 'a'.repeat(32);
  const value = kugouVerificationUrl(event, '/tracker/v5/url?token=secret');
  assert.ok(value?.startsWith('https://h5.kugou.com/apps/verify/dist/#/index/'));
  assert.ok(!value!.includes('secret'));
  assert.ok(value!.endsWith(encodeURIComponent('https://gateway.kugou.com/tracker/v5/url')));
  for (const invalid of [null, 'https://evil.test/', '../../file', 'gz_tx_event_' + 'a'.repeat(31)]) assert.equal(kugouVerificationUrl(invalid, '/test'), undefined);
});
