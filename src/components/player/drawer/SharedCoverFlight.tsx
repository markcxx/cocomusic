'use client';

import { motion } from 'framer-motion';
import { Cover } from '@/components/common/Cover';
import styles from './SharedCoverFlight.module.css';

export type CoverFlight = {
  id: number;
  from: { left: number; top: number; width: number; height: number; radius: number };
  to: { left: number; top: number; width: number; height: number; radius: number };
  src?: string;
  seed: string;
  direction: 'in' | 'out';
};

/**
 * Floating artwork used during the open/close transition of the lyrics drawer:
 * flies directly between the bottom player bar thumbnail and the stage cover.
 */
export function SharedCoverFlight({ flight, onDone }: {
  flight: CoverFlight;
  onDone: (id: number) => void;
}) {
  return (
    <motion.div
      key={flight.id}
      className={styles.flight}
      style={{
        boxShadow: flight.direction === 'in'
          ? '0 30px 60px rgba(0, 0, 0, 0.35)'
          : '0 10px 24px rgba(0, 0, 0, 0.25)',
      }}
      initial={{
        x: flight.from.left,
        y: flight.from.top,
        width: flight.from.width,
        height: flight.from.height,
        borderRadius: flight.from.radius,
      }}
      animate={{
        x: flight.to.left,
        y: flight.to.top,
        width: flight.to.width,
        height: flight.to.height,
        borderRadius: flight.to.radius,
      }}
      transition={{ type: 'spring', stiffness: 290, damping: 30, mass: 0.85 }}
      onAnimationComplete={() => onDone(flight.id)}
      aria-hidden
    >
      <Cover seed={flight.seed} src={flight.src} radius={0} className={styles.cover} />
    </motion.div>
  );
}
