import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jsonStore } from './store.ts';

test('JSON commits recover backups and publish cache only after a successful write', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'coco-store-'));
  const previous = process.env.COCO_DATA_DIR;
  process.env.COCO_DATA_DIR = dir;
  t.after(() => { if (previous === undefined) delete process.env.COCO_DATA_DIR; else process.env.COCO_DATA_DIR = previous; });
  try {
    const store = jsonStore('test.json', () => ({ count: 0 }));
    store.write({ count: 1 });
    store.write({ count: 2 });
    writeFileSync(path.join(dir, 'test.json'), 'broken');
    assert.deepEqual(jsonStore('test.json', () => ({ count: 0 })).read(), { count: 1 });
    mkdirSync(path.join(dir, 'test.json.tmp'));
    assert.throws(() => store.write({ count: 3 }));
    assert.equal(store.read().count, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('async index transactions serialize updates and recover after a rejected operation', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'coco-store-'));
  const previous = process.env.COCO_DATA_DIR;
  process.env.COCO_DATA_DIR = dir;
  t.after(() => { if (previous === undefined) delete process.env.COCO_DATA_DIR; else process.env.COCO_DATA_DIR = previous; });
  try {
    const store = jsonStore('test.json', () => ({ entries: [] as string[] }));
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const first = store.transaction(async data => { await wait; return { value: { entries: [...data.entries, 'scan'] }, result: 1 }; });
    const second = store.transaction(data => ({ value: { entries: [...data.entries, 'download'] }, result: 2 }));
    release();
    assert.deepEqual(await Promise.all([first, second]), [1, 2]);
    await assert.rejects(store.transaction(() => { throw new Error('bad scan'); }));
    await store.transaction(data => ({ value: { entries: [...data.entries, 'open'] }, result: undefined }));
    assert.deepEqual(store.read().entries, ['scan', 'download', 'open']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
