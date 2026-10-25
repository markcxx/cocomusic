/** Desktop preferences live under Electron userData; browsers retain localStorage. */
export const persistentStorage = {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    const desktop = window.coco?.storage;
    if (!desktop) return localStorage.getItem(key);
    const saved = desktop.getItem(key);
    if (saved !== null) return saved;
    // Migrate each existing preference once; committed desktop data always wins.
    const legacy = localStorage.getItem(key);
    if (legacy !== null) desktop.setItem(key, legacy);
    return legacy;
  },
  setItem(key: string, value: string) {
    if (typeof window === 'undefined') return;
    if (window.coco?.storage) window.coco.storage.setItem(key, value);
    else localStorage.setItem(key, value);
  },
};
