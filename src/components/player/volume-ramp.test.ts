import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { rampVolume } from './volume-ramp';

function page(t: TestContext, hidden: boolean) {
  const document = Object.assign(new EventTarget(), { hidden });
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  const requestAnimationFrame = (callback: FrameRequestCallback) => {
    frames.set(++nextId, callback);
    return nextId;
  };
  const cancelAnimationFrame = (id: number) => frames.delete(id);
  for (const [key, value] of Object.entries({ document, requestAnimationFrame, cancelAnimationFrame })) {
    const before = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (before) Object.defineProperty(globalThis, key, before);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  return { document, frames };
}

test('background pause and resume finish without rendering a frame', t => {
  const { frames } = page(t, true);
  const audio = { volume: 0.8 };
  for (const target of [0, 0.8]) {
    const done = t.mock.fn();
    assert.equal(rampVolume(audio, audio.volume, target, 300, done), null);
    assert.equal(done.mock.callCount(), 1);
    assert.equal(audio.volume, target);
  }
  assert.equal(frames.size, 0);
});

test('hiding during a fade completes it and clears its frame', t => {
  const { document, frames } = page(t, false);
  const done = t.mock.fn();
  const audio = { volume: 1 };
  rampVolume(audio, 1, 0, 300, done);
  assert.equal(frames.size, 1);
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(audio.volume, 0);
  assert.equal(done.mock.callCount(), 1);
  assert.equal(frames.size, 0);
});

test('a cancelled fade cannot pause resumed playback or the next track', t => {
  const { document, frames } = page(t, false);
  const pause = t.mock.fn();
  const audio = { volume: 1 };
  const cancel = rampVolume(audio, 1, 0, 300, pause);
  assert.ok(cancel);
  cancel();
  assert.equal(frames.size, 0);
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(pause.mock.callCount(), 0);
  assert.equal(audio.volume, 1);
});

test('visible playback retains the configured fade and finishes once', t => {
  const { frames, document } = page(t, false);
  t.mock.method(performance, 'now', () => 100);
  const audio = { volume: 1 };
  const done = t.mock.fn();
  rampVolume(audio, 1, 0, 300, done);
  const advance = (now: number) => {
    const [id, callback] = [...frames][0];
    frames.delete(id);
    callback(now);
  };
  advance(250);
  assert.equal(audio.volume, 0.5);
  assert.equal(done.mock.callCount(), 0);
  advance(400);
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(done.mock.callCount(), 1);
  assert.equal(audio.volume, 0);
  assert.equal(frames.size, 0);
});
