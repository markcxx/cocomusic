import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { preferenceStore } from './preferences-store.ts';

test('desktop preferences survive restarts, preserve mute and modes, and recover a corrupt file', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'coco-prefs-'));
  try {
    const store = preferenceStore(dir);
    for (const [key, value] of Object.entries({ volume: '0', 'play-mode': 'shuffle', settings: '{"themeMode":"dark"}', queue: '{"queue":[]}', position: '{"id":"qq:1","t":42}' })) store.set(`coco:${key}`, value);
    assert.equal(preferenceStore(dir).get('coco:volume'), '0');
    assert.equal(preferenceStore(dir).get('coco:play-mode'), 'shuffle');
    assert.equal(preferenceStore(dir).get('coco:position'), '{"id":"qq:1","t":42}');
    if (process.platform !== 'win32') assert.equal(statSync(path.join(dir, 'preferences.json')).mode & 0o777, 0o600);
    store.set('coco:checkpoint', '1');
    writeFileSync(path.join(dir, 'preferences.json'), 'broken');
    const recovered = preferenceStore(dir);
    assert.equal(recovered.get('coco:volume'), '0');
    recovered.set('coco:checkpoint', '2');
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'preferences.json'), 'utf8'))['coco:play-mode'], 'shuffle');
    assert.throws(() => store.set('../outside', 'oops'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('failed commits do not change the committed preference snapshot', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'coco-prefs-'));
  try {
    const store = preferenceStore(dir);
    store.set('coco:volume', '0.4');
    mkdirSync(path.join(dir, 'preferences.json.tmp'));
    assert.throws(() => store.set('coco:volume', '0.9'));
    assert.equal(store.get('coco:volume'), '0.4');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
