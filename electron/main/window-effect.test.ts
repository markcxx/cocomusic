import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launchWithTransparency, needsTransparentWindow } from '../shared/window-effect';

test('glass and transparent can share the same native window; older glass settings upgrade on launch', () => {
  for (const effect of ['scenic', 'transparent']) {
    assert.ok(needsTransparentWindow(effect));
    assert.equal(launchWithTransparency(JSON.stringify({ windowEffect: effect }), false), true);
  }
  for (const effect of ['vibrancy', 'acrylic', 'mica', 'fluent', 'minimal', 'none']) {
    assert.equal(launchWithTransparency(JSON.stringify({ windowEffect: effect }), true), false);
  }
  for (const saved of [null, '{}', 'bad json']) {
    assert.equal(launchWithTransparency(saved, true), true);
    assert.equal(launchWithTransparency(saved, false), false);
  }
});
