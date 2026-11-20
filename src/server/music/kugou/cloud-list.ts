import type { KugouClient } from './client';
import { num, record, rows, type Raw } from './mappers';

const PAGE_SIZE = 300;

/** Authenticated cloud files include per-list IDs and collection timestamps. */
export async function cloudListFiles(client: KugouClient, userid: string, token: string, listid: number, maxPages = Infinity) {
  const files: Raw[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const json = await client.kugouRequest({
      method: 'POST', path: '/v4/get_list_all_file_v3', router: 'cloudlist.service.kugou.com',
      data: { listid, userid: Number(userid), area_code: 1, show_relate_goods: 0, pagesize: PAGE_SIZE, allplatform: 1, show_cover: 1, type: 0, token, page },
    });
    const data = record(json.data);
    const info = rows(data.info);
    files.push(...info);
    if (info.length < PAGE_SIZE || files.length >= (num(data.count) ?? Infinity)) break;
  }
  return files;
}
