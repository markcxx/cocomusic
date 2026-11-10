import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeSkin, SKINS } from './skins.ts';

test('a skin is active only for its own colour and scheme', () => {
  const midnight = SKINS.find(skin => skin.id === 'midnight')!;
  assert.equal(activeSkin(midnight.accent, 'dark'), 'midnight');
  assert.equal(activeSkin(midnight.accent.toUpperCase(), 'dark'), 'midnight');
  assert.equal(activeSkin(midnight.accent, 'light'), 'lavender');
  assert.equal(activeSkin('#123456', 'light'), null);
});

test('skin ids are unique', () => {
  assert.equal(new Set(SKINS.map(skin => skin.id)).size, SKINS.length);
});
