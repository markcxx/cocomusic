'use client';

import { Fragment, useMemo } from 'react';
import { parseMarkdown, type Inline } from '@/lib/markdown';
import styles from './Updates.module.css';

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === 'text') return <Fragment key={index}>{node.text}</Fragment>;
        if (node.type === 'code') return <code key={index}>{node.text}</code>;
        if (node.type === 'strong') return <strong key={index}><Inlines nodes={node.children} /></strong>;
        // The main window opens web links in the system browser.
        return <a key={index} href={node.href} target="_blank" rel="noopener noreferrer"><Inlines nodes={node.children} /></a>;
      })}
    </>
  );
}

/** Release notes Markdown rendered as elements (never as HTML). */
export function ReleaseNotes({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  if (!blocks.length) return <p className={styles.empty}>此版本没有更新说明。</p>;
  return (
    <div className={styles.notes}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') return <h4 key={index}><Inlines nodes={block.children} /></h4>;
        if (block.type === 'paragraph') return <p key={index}><Inlines nodes={block.children} /></p>;
        if (block.type === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return <List key={index}>{block.items.map((item, i) => <li key={i}><Inlines nodes={item} /></li>)}</List>;
        }
        return (
          <div key={index} className={styles.tableWrap}>
            <table>
              <thead><tr>{block.head.map((cell, i) => <th key={i}><Inlines nodes={cell} /></th>)}</tr></thead>
              <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, i) => <td key={i}><Inlines nodes={cell} /></td>)}</tr>)}</tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
