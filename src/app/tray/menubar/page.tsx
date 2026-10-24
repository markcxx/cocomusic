import type { Metadata } from 'next';
import { MenuBarLyrics } from '@/components/tray/MenuBarLyrics';

export const metadata: Metadata = { title: 'CoCo Music 菜单栏歌词' };

/** Offscreen page painted into the macOS menu-bar item (electron/main/tray-windows.ts). */
export default function MenuBarPage() {
  return (
    <>
      <style>{'html,body{background:transparent!important}'}</style>
      <MenuBarLyrics />
    </>
  );
}
