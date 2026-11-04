import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTaskbarProbe, retainTaskbarProbe, resolveTaskbarSlot, type TaskbarProbe } from './taskbar-lyrics-layout';

const probe: TaskbarProbe = {
  available: true, visible: true, fullscreen: false, dark: false, scale: 1,
  bar: { x: 0, y: 1032, width: 1920, height: 48 },
  content: { start: 740, end: 1180 },
  occupied: [{ x: 740, y: 1032, width: 440, height: 48 }, { x: 1674, y: 1032, width: 246, height: 48 }],
};

test('taskbar lyrics fit one gap outside all icons and the notification area', () => {
  const left = resolveTaskbarSlot(probe, 340, 'auto')!;
  assert.deepEqual(left, { x: 8, y: 1036, width: 340, height: 40 });
  const right = resolveTaskbarSlot(probe, 560, 'right')!;
  assert.equal(right.x, 1188);
  assert.equal(right.width, 478);
  for (const r of probe.occupied) assert.ok(right.x + right.width <= r.x || right.x >= r.x + r.width);
});

test('widgets and extra taskbar buttons are excluded; unavailable preferred sides fall back safely', () => {
  const widgets = { ...probe, occupied: [...probe.occupied, { x: 0, y: 1032, width: 620, height: 48 }] };
  const result = resolveTaskbarSlot(widgets, 340, 'left')!;
  assert.ok(result.x > probe.content.end);
  assert.equal(result.width, 340);
  const full = { ...probe, occupied: [...probe.occupied, { x: 0, y: 1032, width: 1920, height: 48 }] };
  assert.equal(resolveTaskbarSlot(full, 340, 'auto'), null);
});

test('full screen, hidden, vertical, missing and malformed taskbars never place a lyric over content', () => {
  for (const p of [null, { ...probe, visible: false }, { ...probe, fullscreen: true }, { ...probe, bar: { x: 0, y: 0, width: 48, height: 1080 } }]) {
    assert.equal(resolveTaskbarSlot(p, 340, 'auto'), null);
  }
  for (const p of [{}, { ...probe, scale: NaN }, { ...probe, occupied: [{ x: NaN }] }, { ...probe, content: { start: -10, end: 1180 } }]) assert.equal(parseTaskbarProbe(p), null);
  assert.ok(parseTaskbarProbe(probe));
});

test('DPI and negative monitor coordinates preserve native physical bounds', () => {
  const scaled: TaskbarProbe = {
    ...probe, scale: 1.5,
    bar: { x: -2880, y: 1548, width: 2880, height: 72 },
    content: { start: -1770, end: -1110 },
    occupied: [{ x: -1770, y: 1548, width: 660, height: 72 }, { x: -369, y: 1548, width: 369, height: 72 }],
  };
  const result = resolveTaskbarSlot(scaled, 340, 'left')!;
  assert.deepEqual(result, { x: -2868, y: 1554, width: 510, height: 60 });
});

test('left-aligned Start/apps are avoided while centered Start leaves the screen edge available', () => {
  const leftAligned = { ...probe, centered: false, content: { start: 0, end: 600 }, occupied: [{ x: 0, y: 1032, width: 600, height: 48 }, probe.occupied[1]] };
  assert.equal(resolveTaskbarSlot(leftAligned, 340, 'auto')!.x, 608);
  const widgets = { ...probe, occupied: [{ x: 0, y: 1032, width: 180, height: 48 }, ...probe.occupied] };
  assert.equal(resolveTaskbarSlot(widgets, 340, 'auto')!.x, 188);
});

test('a transient UIA failure on app switching keeps stable geometry briefly without masking real hiding', () => {
  const previous = { ...probe, centered: true, foreground: '1' };
  const transient = { ...previous, available: false, transient: true, foreground: '2' };
  const kept = retainTaskbarProbe(previous, transient, 1000, 1500);
  assert.equal(kept?.foreground, '2');
  assert.deepEqual(kept?.bar, probe.bar);
  assert.equal(retainTaskbarProbe(previous, transient, 1000, 3000), null);
  assert.equal(retainTaskbarProbe(previous, { ...transient, visible: false }, 1000, 1500), null);
  assert.equal(retainTaskbarProbe(previous, { ...transient, fullscreen: true }, 1000, 1500), null);
  assert.equal(retainTaskbarProbe(previous, { ...transient, centered: false }, 1000, 1500), null);
  assert.equal(retainTaskbarProbe(previous, { ...transient, bar: { ...probe.bar, y: 1078 } }, 1000, 1500), null);
});
