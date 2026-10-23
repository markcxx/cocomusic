import styles from './SearchPanel.module.css';

/** Emphasises the first case-insensitive occurrence of `match` within `text`. */
export function Highlight({ text, match }: { text: string; match: string }) {
  const index = match ? text.toLowerCase().indexOf(match.toLowerCase()) : -1;
  if (index < 0) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, index)}
      <mark className={styles.mark}>{text.slice(index, index + match.length)}</mark>
      {text.slice(index + match.length)}
    </span>
  );
}
