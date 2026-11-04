import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NativeImage } from 'electron';
import { thumbnailArtwork, thumbnailSize } from './taskbar-thumbnail.ts';

const image = (name: string, empty = false) => ({ name, isEmpty: () => empty }) as unknown as NativeImage;
const parameter = (width: number, height: number) => { const result = Buffer.alloc(8); result.writeUInt32LE((width << 16) | height); return result; };
const settle = () => new Promise(resolve => setImmediate(resolve));

test('thumbnail fits both DWM dimensions and caps allocation', () => {
  assert.equal(thumbnailSize(parameter(320, 180)), 180);
  assert.equal(thumbnailSize(parameter(120, 240)), 120);
  assert.equal(thumbnailSize(parameter(2048, 1024)), 512);
  assert.equal(thumbnailSize(parameter(0, 0)), 1);
});

test('slow old cover cannot replace a new song; errors and missing covers use fallback', async () => {
  const fallback = image('default');
  const pending = new Map<string, { resolve: (value: NativeImage) => void; reject: (error: Error) => void; signal: AbortSignal }>();
  let painted: NativeImage | undefined;
  let invalidations = 0;
  const artwork = thumbnailArtwork({ isDestroyed: () => false, invalidate: () => invalidations++, paint: value => { painted = value; } }, fallback,
    (url, signal) => new Promise((resolve, reject) => pending.set(url, { resolve, reject, signal })));
  artwork.update('old');
  artwork.update('new');
  assert.equal(pending.get('old')!.signal.aborted, true);
  const latest = image('new');
  pending.get('new')!.resolve(latest);
  await settle();
  pending.get('old')!.resolve(image('old'));
  await settle();
  artwork.paint(parameter(200, 200));
  assert.equal(painted, latest);
  const count = invalidations;
  artwork.update('new');
  assert.equal(invalidations, count);
  artwork.update('failed');
  pending.get('failed')!.reject(new Error('network'));
  await settle();
  artwork.paint(parameter(200, 200));
  assert.equal(painted, fallback);
  artwork.update('');
  artwork.paint(parameter(200, 200));
  assert.equal(painted, fallback);
  artwork.update('closing');
  artwork.dispose();
  pending.get('closing')!.resolve(image('late'));
  await settle();
  assert.equal(pending.get('closing')!.signal.aborted, true);
  assert.equal(invalidations, count + 3);
});
