import type { CatalogProvider } from '../types';
import { createKugouAccount } from './account';
import { createKugouCatalog } from './catalog';
import { createKugouClient } from './client';
import type { KugouSource } from './config';
import { createKugouPlayback } from './playback';

export function createKugouProvider(source: KugouSource): CatalogProvider {
  const client = createKugouClient(source);
  const { topArtists: artists, ...catalog } = createKugouCatalog(client);
  return { source, ...catalog, artists, ...createKugouPlayback(client), account: createKugouAccount(client).kugouAccount };
}
export const kugouProvider = createKugouProvider('kugou');
export const kugouLiteProvider = createKugouProvider('kugou-lite');
