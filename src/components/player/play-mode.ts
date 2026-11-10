/** One cycling control: list loop → shuffle → single loop → in order (stops at the end). */
export type PlayMode = 'loop' | 'shuffle' | 'one' | 'order';
export const playModes: readonly PlayMode[] = ['loop', 'shuffle', 'one', 'order'];
export const playModeLabels: Record<PlayMode, string> = { loop: '列表循环', shuffle: '随机播放', one: '单曲循环', order: '顺序播放' };

/** Uniform pick among the other `length - 1` positions (shuffle never repeats the current song). */
export function randomOtherIndex(current: number, length: number, random = Math.random) {
  const pick = Math.floor(random() * (length - 1));
  return current >= 0 && pick >= current ? pick + 1 : pick;
}
