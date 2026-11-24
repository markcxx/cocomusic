'use client';

import { ImagePlus, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { Range } from '@/components/settings/controls';
import { setter } from '@/components/settings/shared';
import { Button, toast } from '@/components/ui';
import { backdropImage, useBackdropImage } from '@/lib/backdrop-image';
import { useSettings } from '@/lib/settings';
import styles from './BackdropPicker.module.css';

/** 背景图: choose a picture for the window background, then tune its blur and veil. */
export function BackdropPicker({ disabled }: { disabled?: boolean }) {
  const image = useBackdropImage();
  const s = useSettings();
  const input = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try { await backdropImage.setFromFile(file); } catch { toast.error('这张图片无法使用，请换一张试试'); }
  };

  return (
    <div className={styles.picker}>
      <button type="button" className={styles.drop} disabled={disabled} onClick={() => input.current?.click()} aria-label={image ? '更换背景图' : '选择背景图'}>
        {image ? <span className={styles.image} style={{ backgroundImage: `url("${image}")` }}><span className={styles.caption}>已选原图</span></span> : <span className={styles.empty}><ImagePlus size={20} strokeWidth={1.5} />选择一张图片作为窗口背景</span>}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={event => { void onFile(event.target.files?.[0]); event.target.value = ''; }} />
      {image && (
        <>
          <div className={styles.actions}>
            <Button onClick={() => input.current?.click()} disabled={disabled}>更换</Button>
            <Button variant="ghost" icon={<Trash2 size={14} strokeWidth={1.6} />} onClick={backdropImage.clear} disabled={disabled}>移除</Button>
          </div>
          <label className={styles.line}>模糊<Range value={s.backdropBlur} max={40} onChange={setter('backdropBlur')} label="背景模糊" format={value => `${value}px`} /></label>
          <label className={styles.line}>遮罩<Range value={s.backdropDim} max={70} step={5} onChange={setter('backdropDim')} label="背景遮罩" format={value => `${value}%`} /></label>
        </>
      )}
    </div>
  );
}
