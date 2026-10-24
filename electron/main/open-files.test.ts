import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { audioFilesFromArgv } from './open-files-argv.ts';

test('picks existing audio files out of an Electron argv', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'coco-argv-'));
  try {
    const song = path.join(dir, '晴天 - 周杰伦.mp3');
    const flac = path.join(dir, 'b.FLAC');
    writeFileSync(song, '');
    writeFileSync(flac, '');
    writeFileSync(path.join(dir, 'cover.jpg'), '');
    // Dev: [electron, '.', file] · packaged Windows: [exe, file, --flag] · relative to cwd.
    assert.deepEqual(audioFilesFromArgv(['electron', '.', song]), [song]);
    assert.deepEqual(audioFilesFromArgv(['CoCo Music.exe', '--allow-file-access', song, 'b.FLAC', 'cover.jpg', 'missing.mp3'], dir), [song, flac]);
    assert.deepEqual(audioFilesFromArgv(['CoCo Music.exe']), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
