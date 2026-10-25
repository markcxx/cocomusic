import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWheelMotion, sectionScrollTop } from './wheel-motion.ts';

function host() {
  const element = { scrollTop: 0, scrollHeight: 5000, clientHeight: 500 };
  let id = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const motion = createWheelMotion(element, { request(callback) { callbacks.set(++id, callback); return id; }, cancel(frame) { callbacks.delete(frame); } });
  const tick = () => { const entries = [...callbacks]; callbacks.clear(); for (const [, callback] of entries) callback(0); };
  return { element, motion, callbacks, tick };
}

test('section navigation stops active wheel inertia before moving to another section', () => {
  const h = host();
  h.motion.by(400);
  h.tick();
  assert.ok(h.element.scrollTop > 0 && h.element.scrollTop < 400);
  h.motion.stop();
  h.element.scrollTop = 2300; // The navigation command now owns scrolling.
  h.tick();
  assert.equal(h.element.scrollTop, 2300);
  assert.equal(h.callbacks.size, 0);
  h.motion.by(100);
  h.tick();
  assert.ok(h.element.scrollTop > 2300 && h.element.scrollTop < 2400);
});

test('native scrolling can interrupt inertia, and wheel targets stay within bounds', () => {
  const h = host();
  h.motion.by(300);
  h.motion.stop(); // Trackpad native scroll takes over.
  h.element.scrollTop = 750;
  h.motion.sync();
  h.tick();
  assert.equal(h.element.scrollTop, 750);
  h.motion.by(-10000);
  for (let i = 0; i < 100; i++) h.tick();
  assert.equal(h.element.scrollTop, 0);
  h.motion.by(10000);
  for (let i = 0; i < 100; i++) h.tick();
  assert.equal(h.element.scrollTop, 4500);
});

test('wheel animation terminates when the browser rounds fractional scroll positions', () => {
  const h = host();
  let top = 0;
  Object.defineProperty(h.element, 'scrollTop', { get: () => top, set: (value: number) => { top = Math.round(value); } });
  h.motion.by(400);
  for (let i = 0; i < 100; i++) h.tick();
  assert.equal(h.element.scrollTop, 400);
  assert.equal(h.callbacks.size, 0);
});

test('section offsets stay correct before and after manual scroll, regardless of offsetParent', () => {
  const root = { scrollTop: 0, clientTop: 2, getBoundingClientRect: () => ({ top: 100 } as DOMRect) };
  const target = { getBoundingClientRect: () => ({ top: 2202 - root.scrollTop } as DOMRect) };
  assert.equal(sectionScrollTop(root, target), 2084);
  root.scrollTop = 1600;
  assert.equal(sectionScrollTop(root, target), 2084);
  root.scrollTop = 3000;
  assert.equal(sectionScrollTop(root, target), 2084);
});
