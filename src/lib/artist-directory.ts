import type { CatalogSource } from '@/server/music/types';

export interface ArtistDirectoryQuery {
  area: string;
  type: string;
  genre: string;
  initial: string;
  offset: number;
  limit: number;
}
export type ArtistFilterKey = 'area' | 'type' | 'genre' | 'initial';
export interface ArtistFilter { key: ArtistFilterKey; label: string; options: Array<{ id: string; label: string }> }
const options = (values: Array<[string, string]>) => values.map(([id, label]) => ({ id, label }));
const types = (ids: string[]) => options(ids.map((id, index) => [id, ['男歌手', '女歌手', '乐队 / 组合'][index]]));
const initials: ArtistFilter = { key: 'initial', label: '索引', options: options([['', '热门'], ...Array.from({ length: 26 }, (_, i): [string, string] => [String.fromCharCode(65 + i), String.fromCharCode(65 + i)]), ['#', '其他']]) };

/** Only expose filters the selected platform actually implements. Empty ids mean all. */
export const ARTIST_FILTERS: Record<CatalogSource, ArtistFilter[]> = {
  netease: [
    { key: 'area', label: '地区', options: options([['7', '华语'], ['96', '欧美'], ['8', '日本'], ['16', '韩国'], ['0', '其他']]) },
    { key: 'type', label: '类型', options: types(['1', '2', '3']) }, initials,
  ],
  qq: [
    { key: 'area', label: '地区', options: options([['200', '内地'], ['2', '港台'], ['5', '欧美'], ['4', '日本'], ['3', '韩国'], ['6', '其他']]) },
    { key: 'type', label: '类型', options: types(['0', '1', '2']) },
    { key: 'genre', label: '流派', options: options([['1', '流行'], ['6', '嘻哈'], ['2', '摇滚'], ['4', '电子'], ['3', '民谣'], ['8', 'R&B'], ['10', '民歌'], ['9', '轻音乐'], ['5', '爵士'], ['14', '古典'], ['25', '乡村'], ['20', '蓝调']]) }, initials,
  ],
  kugou: [
    { key: 'area', label: '地区', options: options([['1', '华语'], ['7', '粤语'], ['8', '闽南语'], ['2', '欧美'], ['5', '日本'], ['6', '韩国'], ['4', '其他']]) },
    { key: 'type', label: '类型', options: types(['1', '2', '3']) }, initials,
  ],
};
