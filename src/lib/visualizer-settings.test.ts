import assert from 'node:assert/strict';
import { test } from 'node:test';
import { needsSamples, stripTemplate } from './settings';

test('the bottom strip comes from the look itself or from 经典唱片 pairing', () => {
  assert.equal(stripTemplate('lines', 'none'), 'lines');
  assert.equal(stripTemplate('glow', 'lines'), 'glow');
  assert.equal(stripTemplate('vinyl', 'none'), null);
  assert.equal(stripTemplate('vinyl', 'glow'), 'glow');
  assert.equal(stripTemplate('scale', 'glow'), null, 'pairing only applies to 经典唱片');
  assert.equal(stripTemplate('off', 'lines'), null);
});

test('audio is read only when something actually reacts to it', () => {
  assert.equal(needsSamples('off', 'lines'), false);
  assert.equal(needsSamples('vinyl', 'none'), false);
  assert.equal(needsSamples('vinyl', 'lines'), true);
  assert.equal(needsSamples('melody', 'none'), true);
});
