import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { downloadInstaller, type DownloadProgress } from './update-download.ts';

const bytes = Buffer.from('verified installer bytes');
const expected = createHash('sha256').update(bytes).digest('hex');
const asset = { name: 'CoCo-Music-0.0.2-mac-arm64.dmg', url: 'https://example.test/installer', size: bytes.length };

test('downloads in-process, reports completion, and reuses only a verified cached installer', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'coco-update-download-'));
  let calls = 0;
  const progress: DownloadProgress[] = [];
  const options = { directory, asset, expected, signal: new AbortController().signal, fetch: async () => { calls++; return new Response(bytes); }, onProgress: (next: DownloadProgress) => progress.push(next) };
  try {
    const result = await downloadInstaller(options);
    assert.deepEqual(await readFile(result.file), bytes);
    assert.deepEqual(progress.at(-1), { received: bytes.length, total: bytes.length, speed: 0 });
    assert.ok(!(await readdir(directory)).some(name => name.endsWith('.part')));
    await downloadInstaller(options);
    assert.equal(calls, 1);
    await writeFile(result.file, 'corrupted cache');
    await downloadInstaller(options);
    assert.equal(calls, 2);
    assert.deepEqual(await readFile(result.file), bytes);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('checksum errors leave no installer and can be retried successfully', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'coco-update-download-'));
  const options = { directory, asset, expected, signal: new AbortController().signal, fetch: async () => new Response('bad download'), onProgress: () => {} };
  try {
    await assert.rejects(downloadInstaller(options), /校验失败/);
    assert.deepEqual(await readdir(directory), []);
    await downloadInstaller({ ...options, fetch: async () => new Response(bytes) });
    assert.deepEqual(await readFile(path.join(directory, asset.name)), bytes);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('cancel aborts streaming and removes the partial file; HTTP failures are reported', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'coco-update-download-'));
  const controller = new AbortController();
  let canceled = false;
  try {
    await assert.rejects(downloadInstaller({
      directory, asset, expected, signal: controller.signal,
      fetch: async () => new Response(new ReadableStream({
        start(stream) { stream.enqueue(bytes.subarray(0, 4)); },
        cancel() { canceled = true; },
      })),
      onProgress: () => controller.abort(),
    }), error => error instanceof Error && error.name === 'AbortError');
    assert.equal(canceled, true);
    assert.deepEqual(await readdir(directory), []);
    await assert.rejects(downloadInstaller({ directory, asset, expected, signal: new AbortController().signal, fetch: async () => new Response(null, { status: 503 }), onProgress: () => {} }), /503/);
    assert.deepEqual(await readdir(directory), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
