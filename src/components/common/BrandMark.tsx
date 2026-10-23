import localFont from 'next/font/local';
import styles from './BrandMark.module.css';

// Brand: logo mark + Geo typeface (public/fonts, OFL licensed).
const geo = localFont({ src: '../../../public/fonts/Geo-Regular.ttf', display: 'swap' });

export function BrandMark() {
  return (
    <span className={styles.brand}>
      <img src="/images/logo.svg" alt="" width={34} height={34} className={styles.logo} draggable={false} />
      <span className={`${geo.className} ${styles.wordmark}`}>CoCo</span>
    </span>
  );
}
