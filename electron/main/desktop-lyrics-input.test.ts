import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overLyricsUnlock } from './desktop-lyrics-input';

test('locked lyrics reserve only the centred unlock control, including on negative-coordinate displays', () => {
  const bounds = { x: -1200, y: 100, width: 820 };
  assert.equal(overLyricsUnlock(bounds, { x: -790, y: 120 }), true);
  assert.equal(overLyricsUnlock(bounds, { x: -790, y: 180 }), false);
  assert.equal(overLyricsUnlock(bounds, { x: -820, y: 120 }), false);
  assert.equal(overLyricsUnlock(bounds, { x: -790, y: 99 }), false);
});

test('unlock hit area follows renderer zoom and window movement', () => {
  assert.equal(overLyricsUnlock({ x: 100, y: 200, width: 1000 }, { x: 635, y: 270 }, 2), true);
  assert.equal(overLyricsUnlock({ x: 100, y: 200, width: 1000 }, { x: 635, y: 270 }, 1), false);
  assert.equal(overLyricsUnlock({ x: 200, y: 300, width: 1000 }, { x: 635, y: 270 }, 2), false);
});
