import type { Metadata } from 'next';
import { TrayPanel } from '@/components/tray/TrayPanel';
import { TooltipLayer } from '@/components/ui';

export const metadata: Metadata = { title: 'CoCo Music' };

/** Tray / menu-bar icon right-click panel (electron/main/tray-windows.ts). */
export default function TrayPage() {
  return (
    <>
      {/* Transparent window: only the card paints. */}
      <style>{'html,body{background:transparent!important}'}</style>
      <TrayPanel />
      <TooltipLayer />
    </>
  );
}
