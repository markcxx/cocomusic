/** Electron fixes the alpha channel of the main window when it is constructed. */
export function needsTransparentWindow(effect: string) {
  return effect === 'scenic' || effect === 'transparent';
}

export function launchWithTransparency(savedSettings: string | null, legacyFlag: boolean) {
  if (savedSettings) {
    try {
      const effect = JSON.parse(savedSettings)?.windowEffect;
      if (typeof effect === 'string') return needsTransparentWindow(effect);
    } catch { /* Older installs may only have the native construction flag. */ }
  }
  return legacyFlag;
}
