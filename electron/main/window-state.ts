import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { app, screen, type BrowserWindow, type Rectangle } from 'electron';

export const MIN_WIDTH = 1100;
export const MIN_HEIGHT = 700;

type WindowState = { bounds: Rectangle; maximized: boolean };

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function readState(): WindowState | undefined {
  try {
    if (!existsSync(stateFile())) return undefined;
    const value = JSON.parse(readFileSync(stateFile(), 'utf8')) as WindowState;
    return value?.bounds?.width ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Saved bounds if they still fit a connected display; otherwise ~82% of the work area, capped at 1440x900. */
export function initialBounds(): { bounds: Partial<Rectangle> & { width: number; height: number }; maximized: boolean } {
  const saved = readState();
  if (saved) {
    const area = screen.getDisplayMatching(saved.bounds).workArea;
    const visible = saved.bounds.x < area.x + area.width - 100 && saved.bounds.y < area.y + area.height - 100
      && saved.bounds.x + saved.bounds.width > area.x + 100 && saved.bounds.y >= area.y - 10;
    if (visible) {
      return {
        bounds: { ...saved.bounds, width: Math.min(saved.bounds.width, area.width), height: Math.min(saved.bounds.height, area.height) },
        maximized: saved.maximized,
      };
    }
  }
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return {
    bounds: {
      width: Math.max(Math.min(MIN_WIDTH, width), Math.min(1440, Math.round(width * 0.82))),
      height: Math.max(Math.min(MIN_HEIGHT, height), Math.min(900, Math.round(height * 0.82))),
    },
    maximized: false,
  };
}

export function trackWindowState(window: BrowserWindow) {
  let timer: NodeJS.Timeout | undefined;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (window.isDestroyed() || window.isMinimized()) return;
      const state: WindowState = { bounds: window.getNormalBounds(), maximized: window.isMaximized() };
      try { writeFileSync(stateFile(), JSON.stringify(state)); } catch { /* best effort */ }
    }, 400);
  };
  window.on('resize', save);
  window.on('move', save);
  window.on('close', save);
}
