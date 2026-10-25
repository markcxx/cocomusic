import type { ArtistBiography } from './types';

/** Strip upstream markup; the UI always renders plain text. */
export function artistText(value: unknown) {
  return typeof value === 'string' ? value.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\r\n?/g, '\n').trim() : '';
}

export function mapBiography(brief: unknown, sections: unknown): ArtistBiography {
  const items = Array.isArray(sections) ? sections : [];
  return {
    brief: artistText(brief),
    sections: items.flatMap(value => {
      if (!value || typeof value !== 'object') return [];
      const item = value as Record<string, unknown>;
      const text = artistText(item.txt ?? item.content);
      return text ? [{ title: artistText(item.ti ?? item.title) || '更多介绍', text }] : [];
    }),
  };
}
