// The staff wiki's markdown subset, with no React so checks and the page can share it.
// Headings, lists, tables, fenced code, quotes, and inline code / bold / links.

export type WikiBlock =
  | { kind: 'h2' | 'h3'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'pre'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'table'; header: string[]; rows: string[][] };

const isSpecial = (line: string) =>
  /^#{2,3}\s/.test(line) || /^[-*]\s/.test(line) || /^\d+\.\s/.test(line) || /^\|/.test(line) || /^>\s?/.test(line) || line.startsWith('```');

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

const isRule = (line: string) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());

/** The blocks of a wiki page body. */
export function wikiBlocks(source: string): WikiBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: WikiBlock[] = [];
  let i = 0;
  const pushParagraph = (buf: string[]) => {
    const text = buf.join(' ').trim();
    if (text) blocks.push({ kind: 'p', text });
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (line.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++; }
      blocks.push({ kind: 'pre', text: buf.join('\n') });
      i++;
      continue;
    }

    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: heading[1].length === 2 ? 'h2' : 'h3', text: heading[2].trim() });
      i++;
      continue;
    }

    if (/^[-*]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const ordered = /^\d+\.\s/.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\d+\.\s/.test(lines[i]) : /^[-*]\s/.test(lines[i]))) {
        items.push(lines[i].replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, ''));
        i++;
      }
      blocks.push({ kind: ordered ? 'ol' : 'ul', items });
      continue;
    }

    if (line.startsWith('|') && i + 1 < lines.length && isRule(lines[i + 1])) {
      const header = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(cells(lines[i])); i++; }
      blocks.push({ kind: 'table', header, rows });
      continue;
    }

    if (line.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      blocks.push({ kind: 'quote', text: buf.join(' ') });
      continue;
    }

    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !isSpecial(lines[i])) { buf.push(lines[i].trim()); i++; }
    pushParagraph(buf);
  }
  return blocks;
}

/** A link the wiki is willing to render: a site path, or https. Anything else stays plain text. */
export function wikiLink(href: string): string | null {
  if (href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/\\') && !/[\s\\]/.test(href)) return href;
  if (/^https:\/\/[^\s]+$/.test(href)) return href;
  return null;
}
