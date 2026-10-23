import { cn } from '@/lib/cn';
import styles from './Equalizer.module.css';

/** Three bouncing bars marking the track that is currently playing. */
export function Equalizer({ className }: { className?: string }) {
  return (
    <span className={cn(styles.eq, className)} aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}
