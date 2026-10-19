import Link from 'next/link';
import type { ReactNode } from 'react';
import { wikiBlocks, wikiLink, type WikiBlock } from '@/lib/wiki-markdown';

// Renders the staff wiki's markdown subset as React text, never raw HTML.

function inline(text: string, key: string): ReactNode[] {
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;
  const out: ReactNode[] = [];
  let at = 0;
  let n = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > at) out.push(text.slice(at, start));
    const token = m[0];
    const id = `${key}-${n++}`;
    if (token.startsWith('`')) out.push(<code key={id} className="rounded-sm bg-black/40 px-1 py-0.5 text-[0.85em] text-yellow-100">{token.slice(1, -1)}</code>);
    else if (token.startsWith('**')) out.push(<strong key={id} className="font-semibold text-white">{token.slice(2, -2)}</strong>);
    else {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const href = link ? wikiLink(link[2]) : null;
      if (link && href && href.startsWith('/')) out.push(<Link key={id} href={href} className="font-semibold text-yellow-300 underline decoration-yellow-500/40 underline-offset-2 hover:text-yellow-200">{link[1]}</Link>);
      else if (link && href) out.push(<a key={id} href={href} className="font-semibold text-yellow-300 underline decoration-yellow-500/40 underline-offset-2 hover:text-yellow-200">{link[1]}</a>);
      else out.push(token);
    }
    at = start + token.length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

export function WikiBody({ source }: { source: string }) {
  const blocks = wikiBlocks(source);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-gray-300">
      {blocks.map((block: WikiBlock, i) => {
        const key = `b${i}`;
        if (block.kind === 'h2') return <h2 key={key} className="pt-3 text-xl font-bold text-white first:pt-0">{inline(block.text, key)}</h2>;
        if (block.kind === 'h3') return <h3 key={key} className="pt-2 text-base font-semibold text-white">{inline(block.text, key)}</h3>;
        if (block.kind === 'p') return <p key={key}>{inline(block.text, key)}</p>;
        if (block.kind === 'quote') return <blockquote key={key} className="border-l-2 border-yellow-500/40 pl-3 text-gray-400">{inline(block.text, key)}</blockquote>;
        if (block.kind === 'ul' || block.kind === 'ol') {
          const List = block.kind === 'ul' ? 'ul' : 'ol';
          return (
            <List key={key} className={block.kind === 'ul' ? 'list-disc space-y-1 pl-5' : 'list-decimal space-y-1 pl-5'}>
              {block.items.map((item, j) => <li key={j}>{inline(item, `${key}-${j}`)}</li>)}
            </List>
          );
        }
        if (block.kind === 'pre') return <pre key={key} className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-950 p-3 text-xs text-gray-200"><code>{block.text}</code></pre>;
        if (block.kind !== 'table') return null;
        return (
          <div key={key} className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr>{block.header.map((cell, j) => <th key={j} className="border-b border-gray-800 px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">{inline(cell, `${key}-h${j}`)}</th>)}</tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r} className="border-b border-gray-800/70">
                    {row.map((cell, c) => <td key={c} className="px-2 py-1.5 align-top">{inline(cell, `${key}-${r}-${c}`)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
