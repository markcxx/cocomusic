'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

export type Selection = {
  /** Selection mode on (checkbox column visible). */
  active: boolean;
  selected: Set<string>;
  count: number;
  isSelected: (id: string) => boolean;
  /** Toggle one id; with `range` (shift-click) select everything from the last anchor. */
  toggle: (id: string, range?: boolean) => void;
  /** Select all `ids`, or clear them if all are already selected. */
  toggleAll: () => void;
  allSelected: boolean;
  someSelected: boolean;
  start: () => void;
  exit: () => void;
  clear: () => void;
};

/** Ordered multi-select over `ids` (current visible order), with shift-range support. */
export function useSelection(ids: string[]): Selection {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const anchor = useRef<string | null>(null);

  const toggle = useCallback((id: string, range = false) => {
    setActive(true);
    setSelected(previous => {
      const next = new Set(previous);
      const from = anchor.current ? ids.indexOf(anchor.current) : -1;
      const to = ids.indexOf(id);
      if (range && from >= 0 && to >= 0) {
        const [a, b] = from < to ? [from, to] : [to, from];
        // Range takes the anchor's state, like file managers do.
        const select = previous.has(ids[from]);
        for (const item of ids.slice(a, b + 1)) { if (select) next.add(item); else next.delete(item); }
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchor.current = id;
  }, [ids]);

  const visibleSelected = useMemo(() => ids.filter(id => selected.has(id)).length, [ids, selected]);
  const allSelected = ids.length > 0 && visibleSelected === ids.length;

  const toggleAll = useCallback(() => {
    setActive(true);
    setSelected(previous => {
      const next = new Set(previous);
      const every = ids.length > 0 && ids.every(id => next.has(id));
      for (const id of ids) { if (every) next.delete(id); else next.add(id); }
      return next;
    });
  }, [ids]);

  return {
    active,
    selected,
    count: selected.size,
    isSelected: id => selected.has(id),
    toggle,
    toggleAll,
    allSelected,
    someSelected: visibleSelected > 0 && !allSelected,
    start: () => setActive(true),
    exit: () => { setActive(false); setSelected(new Set()); anchor.current = null; },
    clear: () => setSelected(new Set()),
  };
}
