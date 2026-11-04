import type { Metadata } from 'next';
import { TaskbarLyrics } from '@/components/tray/TaskbarLyrics';

export const metadata: Metadata = { title: 'CoCo Music 任务栏歌词' };
export default function TaskbarPage() {
  return <><style>{'html,body{background:transparent!important;overflow:hidden!important}'}</style><TaskbarLyrics /></>;
}
