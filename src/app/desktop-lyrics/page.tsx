import type { Metadata } from 'next';
import { DesktopLyrics } from '@/components/desktop-lyrics/DesktopLyrics';
import { TooltipLayer } from '@/components/ui';

export const metadata: Metadata = { title: 'CoCo Music 桌面歌词' };

/** Loaded by the desktop lyrics window (electron/main/desktop-lyrics.ts). */
export default function DesktopLyricsPage() {
  return (
    <>
      {/* Server-rendered so the very first paint is already transparent (no flash when the window shows). */}
      <style>{'html,body{background:transparent!important}'}</style>
      <DesktopLyrics />
      <TooltipLayer />
    </>
  );
}
