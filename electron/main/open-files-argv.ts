import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

// Self-contained (no `electron`, no local imports) so tests can load it with plain Node.
// Keep in sync with AUDIO_EXTENSIONS in ../shared/ipc.ts.
const EXTENSIONS = ['mp3', 'flac', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'webm'];

export const isAudioPath = (file: string) => EXTENSIONS.includes(path.extname(file).slice(1).toLowerCase());

/**
 * Audio file paths among command-line arguments: skips the executable, flags,
 * the app path (`.` in dev) and anything that is not an existing audio file.
 * Relative paths resolve against the launching process's cwd.
 */
export function audioFilesFromArgv(argv: readonly string[], cwd = process.cwd()) {
  return argv
    .slice(1)
    .filter(arg => !arg.startsWith('-') && isAudioPath(arg))
    .map(arg => path.resolve(cwd, arg))
    .filter(file => {
      try { return existsSync(file) && statSync(file).isFile(); } catch { return false; }
    });
}
