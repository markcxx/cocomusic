export type TaskbarRect = { x: number; y: number; width: number; height: number };
export type TaskbarProbe = {
  available: boolean; visible: boolean; fullscreen: boolean; dark: boolean; scale: number;
  bar: TaskbarRect; occupied: TaskbarRect[]; content: { start: number; end: number };
  centered?: boolean;
  foreground?: string;
};
const rect = (value: unknown): value is TaskbarRect => Boolean(value && typeof value === 'object' &&
  ['x', 'y', 'width', 'height'].every(key => Number.isFinite((value as Record<string, unknown>)[key])) &&
  (value as TaskbarRect).width > 0 && (value as TaskbarRect).height > 0);

/** Helper output is bounded and checked before it can position a native window. */
export function parseTaskbarProbe(value: unknown): TaskbarProbe | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as TaskbarProbe;
  if (!v.available || !rect(v.bar) || !Array.isArray(v.occupied) || v.occupied.length > 2048 || !v.occupied.every(rect) ||
      !v.content || !Number.isFinite(v.content.start) || !Number.isFinite(v.content.end) || v.content.end <= v.content.start ||
      !Number.isFinite(v.scale) || v.scale < 1 || v.scale > 5) return null;
  if (v.content.start < v.bar.x || v.content.end > v.bar.x + v.bar.width) return null;
  return { ...v, visible: v.visible === true, fullscreen: v.fullscreen === true, dark: v.dark === true };
}

/** Use a contiguous gap outside the whole icon block, never a gap between apps. */
export function resolveTaskbarSlot(probe: TaskbarProbe | null, width: number, side: 'auto' | 'left' | 'right'): TaskbarRect | null {
  if (!probe?.available || !probe.visible || probe.fullscreen) return null;
  const { bar, scale, content } = probe;
  if (bar.height > bar.width || bar.height / scale < 28 || bar.height / scale > 100) return null;
  const margin = Math.ceil(8 * scale);
  const occupied = [...probe.occupied.map(r => [r.x - margin, r.x + r.width + margin]), [content.start - margin, content.end + margin]]
    .sort((a, b) => a[0] - b[0]);
  const gaps: Array<{ start: number; end: number; side: 'left' | 'right' }> = [];
  let cursor = bar.x + margin;
  for (const [start, end] of [...occupied, [bar.x + bar.width - margin, bar.x + bar.width]]) {
    const edge = Math.min(start, bar.x + bar.width - margin);
    if (edge > cursor && (edge <= content.start || cursor >= content.end)) gaps.push({ start: cursor, end: edge, side: edge <= content.start ? 'left' : 'right' });
    cursor = Math.max(cursor, end);
  }
  const minimum = 168 * scale;
  const preferred = gaps.filter(gap => gap.end - gap.start >= minimum).sort((a, b) => {
    if (side !== 'auto' && a.side !== b.side) return a.side === side ? -1 : 1;
    // Auto starts at the screen's first safe space, rather than attaching to
    // the left edge of the centered Start/app block.
    return side === 'right' ? b.end - a.end : a.start - b.start;
  })[0];
  if (!preferred) return null;
  const desired = Math.max(168, Math.min(560, Number.isFinite(width) ? width : 340));
  const w = Math.floor(Math.min(desired * scale, preferred.end - preferred.start));
  const height = Math.floor(Math.min(bar.height - 8 * scale, 48 * scale));
  return { x: Math.round(side === 'right' ? preferred.end - w : preferred.start), y: Math.round(bar.y + (bar.height - height) / 2), width: w, height };
}

/** A temporary UIA failure on app switching must not blink an unchanged bar.
 * Visibility/fullscreen and geometry changes always take effect immediately. */
export function retainTaskbarProbe(previous: TaskbarProbe | null, raw: unknown, lastValidAt: number, now: number): TaskbarProbe | null {
  const parsed = parseTaskbarProbe(raw);
  if (parsed) return parsed;
  if (!previous || now - lastValidAt > 1800 || !raw || typeof raw !== 'object') return null;
  const value = raw as Partial<TaskbarProbe> & { transient?: boolean };
  if (!value.transient || value.visible !== true || value.fullscreen || !rect(value.bar) || value.scale !== previous.scale || value.centered !== previous.centered) return null;
  if (['x', 'y', 'width', 'height'].some(key => value.bar![key as keyof TaskbarRect] !== previous.bar[key as keyof TaskbarRect])) return null;
  return { ...previous, foreground: value.foreground ?? previous.foreground };
}
