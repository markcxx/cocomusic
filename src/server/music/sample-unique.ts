/** Merge `primary` items first, then fill up to `count` from a shuffled `pool` (deduped by `id`). */
export function sampleUnique<T extends { id: string }>(primary: readonly T[], pool: readonly T[], count: number): T[] {
  const seen = new Set<string>();
  const picked: T[] = [];
  for (const item of primary) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    picked.push(item);
    if (picked.length >= count) return picked;
  }
  const rest = pool.filter(item => item.id && !seen.has(item.id));
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  for (const item of rest) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    picked.push(item);
    if (picked.length >= count) break;
  }
  return picked;
}
