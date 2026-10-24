'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { FileAudio } from 'lucide-react';
import { useOpenLocalFiles } from './open-local-files';
import styles from './Library.module.css';

/**
 * Mounted once in the shell: receives files opened with the app and shows a
 * drop target while audio files are dragged over the window.
 */
export function LocalDropOverlay() {
  const dragging = useOpenLocalFiles();
  return (
    <AnimatePresence>
      {dragging && (
        <motion.div className={styles.dropZone} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.16 }} aria-hidden>
          <FileAudio size={40} strokeWidth={1.2} />
          松开即可播放
          <span>支持 MP3、FLAC、M4A、WAV、OGG 等格式，文件会加入本地音乐</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
