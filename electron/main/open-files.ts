import { app, type BrowserWindow } from 'electron';
import { IPC } from '../shared/ipc';
import { audioFilesFromArgv, isAudioPath } from './open-files-argv';

export { audioFilesFromArgv } from './open-files-argv';

/**
 * "Open with CoCo Music" / double-clicking an associated audio file.
 *
 * - macOS: the OS sends `open-file` (possibly before the app is ready, and for
 *   each file when several are opened).
 * - Windows / Linux: paths arrive as command-line arguments, on first launch in
 *   `process.argv`, later via the single-instance lock's `second-instance`.
 *
 * Paths are queued until the renderer reports it is ready, then sent in one batch.
 */

let target: BrowserWindow | undefined;
let ready = false;
const pending: string[] = [];
/** Files main handed to the renderer; only these may be revealed in Finder/Explorer. */
export const handedOut = new Set<string>();

function flush() {
  if (!target || target.isDestroyed() || !ready || !pending.length) return;
  const files = [...new Set(pending.splice(0))];
  files.forEach(file => handedOut.add(file));
  target.webContents.send(IPC.openFiles, files);
  if (target.isMinimized()) target.restore();
  target.show();
  target.focus();
}

export function queueOpenFiles(files: readonly string[]) {
  const audio = files.filter(isAudioPath);
  if (!audio.length) return;
  pending.push(...audio);
  // macOS batches several files into quick successive events; collect them first.
  setTimeout(flush, 120);
}

/** Must run before `app.whenReady()` so early macOS `open-file` events are not lost. */
export function registerOpenFileHandlers() {
  app.on('open-file', (event, file) => {
    event.preventDefault();
    queueOpenFiles([file]);
  });
  queueOpenFiles(audioFilesFromArgv(process.argv));
}

export function attachOpenFilesWindow(window: BrowserWindow) {
  target = window;
  ready = false;
  // A reload (dev, or crash recovery) needs the renderer to announce itself again.
  window.webContents.on('did-start-loading', () => { ready = false; });
}

/** The renderer announced it can receive files (called from IPC). */
export function markOpenFilesReady() {
  ready = true;
  flush();
}
