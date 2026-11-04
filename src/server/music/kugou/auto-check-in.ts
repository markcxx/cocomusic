import { jsonStore } from '../../local/store';
import { session } from '../session';
import { claimConceptReward, conceptToday } from './membership';

export interface CheckInResult {
  day: string;
  status: 'success' | 'failed' | 'already-done' | 'retry-later' | 'not-logged-in';
  message: string;
  attempted: boolean;
  verificationUrl?: string;
}
type Receipt = { day: string; at: number; status: 'success' | 'failed'; message: string };
type Receipts = Record<string, Receipt>;

/** Reusable coordinator; failed requests never count as a successful day. */
export function dailyCheckIn(deps: {
  read: () => Receipts;
  save: (value: Receipts) => void;
  claim: () => Promise<unknown>;
  now?: () => Date;
}) {
  const running = new Map<string, Promise<CheckInResult>>();
  return (userid: string, retry = false): Promise<CheckInResult> => {
    const now = deps.now?.() ?? new Date();
    const day = conceptToday(now);
    const key = `${userid}:${day}`;
    const pending = running.get(key);
    if (pending) return pending;
    const previous = deps.read()[userid];
    if (previous?.day === day && previous.status === 'success') return Promise.resolve({ day, status: 'already-done', attempted: false, message: '今日已自动签到' });
    if (!retry && previous?.day === day && now.getTime() - previous.at < 10 * 60_000) return Promise.resolve({ day, status: 'retry-later', attempted: false, message: previous.message });
    const task = (async (): Promise<CheckInResult> => {
      let status: Receipt['status'] = 'success';
      let message = '酷狗概念版今日自动签到成功';
      let verificationUrl: string | undefined;
      try { await deps.claim(); }
      catch (error) {
        status = 'failed'; message = error instanceof Error ? error.message : '自动签到失败';
        if (error && typeof error === 'object' && 'verificationUrl' in error && typeof error.verificationUrl === 'string') verificationUrl = error.verificationUrl;
      }
      deps.save({ ...deps.read(), [userid]: { day, at: now.getTime(), status, message } });
      return { day, status, attempted: true, message, ...(verificationUrl ? { verificationUrl } : {}) };
    })().finally(() => running.delete(key));
    running.set(key, task);
    return task;
  };
}

const receipts = jsonStore<Receipts>('concept-checkin.json', () => ({}));
const run = dailyCheckIn({ read: receipts.read, save: receipts.write, claim: claimConceptReward });

export async function autoConceptCheckIn(retry = false): Promise<CheckInResult> {
  const login = session.get('kugou-lite');
  if (!login?.cookie.userid || !login.cookie.token) return { day: conceptToday(), status: 'not-logged-in', message: '请先登录酷狗概念版', attempted: false };
  return run(login.cookie.userid, retry);
}
