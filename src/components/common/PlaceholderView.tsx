'use client';

import { motion } from 'framer-motion';
import { Construction } from 'lucide-react';
import styles from './PlaceholderView.module.css';

/** Destination not built yet; keeps navigation working while pages land one by one. */
export function PlaceholderView({ title }: { title: string }) {
  return (
    <div className={styles.placeholder}>
      <motion.span initial={{ scale: 0.6, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.05 }}>
        <Construction size={36} strokeWidth={1.25} aria-hidden />
      </motion.span>
      <h1>{title}</h1>
      <p>此页面正在建设中</p>
    </div>
  );
}
