import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomOtherIndex } from './play-mode.ts';

test('shuffle never picks the current song and can reach every other one', () => {
  const length = 5;
  for (let current = 0; current < length; current += 1) {
    const picks = new Set<number>();
    for (let slot = 0; slot < length - 1; slot += 1) picks.add(randomOtherIndex(current, length, () => (slot + 0.5) / (length - 1)));
    assert.deepEqual([...picks].sort(), [0, 1, 2, 3, 4].filter(index => index !== current));
  }
});

test('with no current song every position is a candidate', () => {
  assert.equal(randomOtherIndex(-1, 3, () => 0), 0);
  assert.equal(randomOtherIndex(-1, 3, () => 0.99), 1);
});
