import { Loader2 } from 'lucide-react';
import styles from './Spinner.module.css';

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className={styles.spin} aria-hidden />;
}

/** Footer for infinite lists: spinner while loading, a soft end-of-list note after. */
export function ListFooter({ loading, done, loadingText = '正在加载更多', doneText }: { loading: boolean; done: boolean; loadingText?: string; doneText?: string }) {
  return (
    <div className={styles.footer} aria-live="polite">
      {loading && <><Spinner />{loadingText}</>}
      {!loading && done && doneText}
    </div>
  );
}
