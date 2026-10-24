// Audio formats the app can index, stream and be the "open with" handler for.
// Pure data; also imported by tests and kept in sync with electron-builder.yml fileAssociations.

/** Extension → MIME type sent when streaming. Chromium decodes all of these. */
export const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
};

export const AUDIO_EXTENSIONS = Object.keys(AUDIO_TYPES);

export function extensionOf(file: string) {
  const dot = file.lastIndexOf('.');
  return dot < 0 ? '' : file.slice(dot + 1).toLowerCase();
}

export const isAudioFile = (file: string) => extensionOf(file) in AUDIO_TYPES;

/**
 * Characters Windows/macOS reject in file names, control chars, and trailing dots/spaces.
 * Result is never empty and stays under typical path limits.
 */
export function safeFileName(name: string, max = 120) {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  const reserved = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(cleaned);
  const base = (reserved ? `_${cleaned}` : cleaned) || '未命名';
  return [...base].slice(0, max).join('');
}
