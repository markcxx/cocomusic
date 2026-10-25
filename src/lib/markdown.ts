/**
 * Just enough Markdown for release notes (.github/release-notes/*.md):
 * headings, paragraphs, bullet / numbered lists and tables, with inline code,
 * bold and links. Produces a plain tree that React renders as elements, so
 * remote text is never injected as HTML.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

export type Block =
  | { type: 'heading'; level: number; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'table'; head: Inline[][]; rows: Inline[][][] };

/** Only web links survive; anything else (javascript:, file:) renders as text. */
const safeHref = (href: string) => (/^https?:\/\//i.test(href) ? href : null);

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => { if (text) { out.push({ type: 'text', text }); text = ''; } };
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const code = /^`([^`]+)`/.exec(rest);
    if (code) { flush(); out.push({ type: 'code', text: code[1] }); index += code[0].length; continue; }
    const strong = /^\*\*(.+?)\*\*/.exec(rest);
    if (strong) { flush(); out.push({ type: 'strong', children: parseInline(strong[1]) }); index += strong[0].length; continue; }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (link) {
      flush();
      const href = safeHref(link[2]);
      if (href) out.push({ type: 'link', href, children: parseInline(link[1]) });
      else out.push(...parseInline(link[1]));
      index += link[0].length;
      continue;
    }
    text += source[index];
    index++;
  }
  flush();
  return out;
}

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => parseInline(cell.trim()));
const isTableDivider = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', children: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) { flush(); continue; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { flush(); blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2].trim()) }); continue; }
    if (line.trim().startsWith('|') && isTableDivider(lines[index + 1] ?? '')) {
      flush();
      const head = cells(line);
      const rows: Inline[][][] = [];
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith('|')) rows.push(cells(lines[index++]));
      index--;
      blocks.push({ type: 'table', head, rows });
      continue;
    }
    const item = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (item) {
      flush();
      const ordered = Boolean(item[2]);
      const last = blocks.at(-1);
      const list = last?.type === 'list' && last.ordered === ordered ? last : null;
      if (list) list.items.push(parseInline(item[3]));
      else blocks.push({ type: 'list', ordered, items: [parseInline(item[3])] });
      continue;
    }
    // A wrapped line continues the previous list item.
    const last = blocks.at(-1);
    if (!paragraph.length && last?.type === 'list' && /^\s{2,}\S/.test(line)) {
      last.items[last.items.length - 1].push({ type: 'text', text: ' ' }, ...parseInline(line.trim()));
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}
