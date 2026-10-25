import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

function stub(t: TestContext, name: string, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
}
import { persistentStorage } from './persistent-storage.ts';

test('migrates legacy preferences and keeps desktop values across browser origins', t => {
  const desktop = new Map<string, string>();
  const legacy = new Map([['coco:volume', '0'], ['coco:play-mode', 'one']]);
  stub(t, 'window', { coco: { storage: {
    getItem: (key: string) => desktop.get(key) ?? null,
    setItem: (key: string, value: string) => desktop.set(key, value),
  } } });
  stub(t, 'localStorage', { getItem: (key: string) => legacy.get(key) ?? null });
  assert.equal(persistentStorage.getItem('coco:volume'), '0');
  assert.equal(persistentStorage.getItem('coco:play-mode'), 'one');
  legacy.clear(); // A different service port has a different localStorage.
  assert.equal(persistentStorage.getItem('coco:volume'), '0');
  persistentStorage.setItem('coco:volume', '0.2');
  legacy.set('coco:volume', '0.8');
  assert.equal(persistentStorage.getItem('coco:volume'), '0.2');
});

test('browser preview still uses localStorage', t => {
  const state = new Map<string, string>();
  stub(t, 'window', {});
  stub(t, 'localStorage', {
    getItem: (key: string) => state.get(key) ?? null,
    setItem: (key: string, value: string) => state.set(key, value),
  });
  persistentStorage.setItem('coco:volume', '0.6');
  assert.equal(persistentStorage.getItem('coco:volume'), '0.6');
});
