/**
 * IPC channel names used by the main process.
 * The sandboxed preload cannot import local modules, so electron/preload/index.ts
 * repeats these values; change both together.
 */
export const IPC = {
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowToggleMini: 'window:toggle-mini',
  /** main → renderer: mini mode entered (true) or left (false). */
  miniChanged: 'window:mini-changed',
} as const;

/** Command-line switch carrying the window material to the preload. */
export const MATERIAL_SWITCH = '--coco-material=';
