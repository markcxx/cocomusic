/** Keep this hit area aligned with DesktopLyrics.module.css: top 6px, centred 28px lock. */
export function overLyricsUnlock(
  bounds: { x: number; y: number; width: number },
  cursor: { x: number; y: number },
  zoom = 1,
): boolean {
  const x = cursor.x - bounds.x - bounds.width / 2;
  const y = cursor.y - bounds.y;
  // A small margin gives native hit-testing time to switch before the click.
  return Math.abs(x) <= 20 * zoom && y >= 2 * zoom && y <= 38 * zoom;
}
