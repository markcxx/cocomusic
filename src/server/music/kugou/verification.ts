/** Only construct official, user-operated challenge pages from a valid SSA event. */
export function kugouVerificationUrl(event: string | null, requestPath: string) {
  if (!event || !/^[a-z]{2}_[a-z]{2}_event_[a-f0-9]{32}$/i.test(event)) return undefined;
  // No signed query strings, credentials or caller-selected redirect destinations.
  const callback = `https://gateway.kugou.com${new URL(requestPath, 'https://gateway.kugou.com').pathname}`;
  return `https://h5.kugou.com/apps/verify/dist/#/index/${event}/${encodeURIComponent(callback)}`;
}
