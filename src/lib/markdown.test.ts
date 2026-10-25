import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseInline, parseMarkdown } from './markdown.ts';

test('parses inline code, bold and safe links only', () => {
  assert.deepEqual(parseInline('选 `a.dmg` 或 **b**'), [
    { type: 'text', text: '选 ' }, { type: 'code', text: 'a.dmg' }, { type: 'text', text: ' 或 ' }, { type: 'strong', children: [{ type: 'text', text: 'b' }] },
  ]);
  assert.deepEqual(parseInline('[README](https://github.com/markcxx/cocomusic)'), [
    { type: 'link', href: 'https://github.com/markcxx/cocomusic', children: [{ type: 'text', text: 'README' }] },
  ]);
  // Non-web links keep their text and drop the target.
  assert.deepEqual(parseInline('[x](javascript:alert)'), [{ type: 'text', text: 'x' }]);
});

test('parses the blocks release notes use', () => {
  const blocks = parseMarkdown([
    '首个公开版本。',
    '',
    '## 音乐与播放',
    '',
    '- 第一条',
    '- 第二条',
    '',
    '| 系统 | 安装包 |',
    '| --- | --- |',
    '| macOS | `a.dmg` |',
    '| Windows | `b.exe` |',
  ].join('\n'));
  assert.deepEqual(blocks.map(block => block.type), ['paragraph', 'heading', 'list', 'table']);
  const list = blocks[2];
  assert(list.type === 'list');
  assert.equal(list.items.length, 2);
  const table = blocks[3];
  assert(table.type === 'table');
  assert.equal(table.head.length, 2);
  assert.equal(table.rows.length, 2);
});
