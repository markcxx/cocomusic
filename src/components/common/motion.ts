import type { Transition, Variants } from 'framer-motion';

export const easeOut = [0.22, 1, 0.36, 1] as const;

/** Parent of a staggered list; children use `riseItem`. */
export const staggerList: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } },
};

export const riseItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: easeOut } },
};

export const fadeSwap = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.24, ease: easeOut } satisfies Transition,
};
