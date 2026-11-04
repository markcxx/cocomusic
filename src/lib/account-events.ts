/** Request a credential check for the platform whose request was rejected. */
export const ACCOUNT_RECHECK_EVENT = 'coco:account-recheck';
export function requestAccountRecheck(source: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ACCOUNT_RECHECK_EVENT, { detail: { source } }));
}
/** Unscoped events (e.g. preview playback) continue to check the active account. */
export function accountRecheckMatches(event: Event, platform: string) {
  const source = (event as CustomEvent<{ source?: string }>).detail?.source;
  return !source || source === platform;
}
