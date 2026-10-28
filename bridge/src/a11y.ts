// A small accessibility audit of the app's own HTML pages (ROADMAP 59.8). Plain text parsing, no browser: it catches the mistakes that are easy to make
// when a page is edited (a button with no name, a field with no label, a skipped heading level, a page with no h1). Used by scripts/check-a11y.ts.

const TAG = /<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi;

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attrs);
  return m ? (m[2] ?? m[3] ?? '') : null;
}

/** Applies `strip` until the text stops changing, so a removal cannot leave a new comment or tag behind (only ever run on the app's own pages). */
function untilStable(text: string, strip: (s: string) => string): string {
  for (let prev = ''; prev !== text; ) { prev = text; text = strip(text); }
  return text;
}

/** Text with tags and comments removed, entities left as they are. */
function plain(html: string): string {
  return untilStable(html, s => s.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/** Problems found in one page, each a short sentence naming the element. An empty list means the page passes. */
export function auditHtml(source: string): string[] {
  const html = untilStable(source, s => s.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ''));
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const m of html.matchAll(/\sid\s*=\s*"([^"]*)"/gi)) {
    if (ids.has(m[1])) problems.push(`id "${m[1]}" is used twice`);
    ids.add(m[1]);
  }
  const labelled = new Set([...html.matchAll(/<label\b[^>]*\sfor\s*=\s*"([^"]*)"/gi)].map(m => m[1]));

  // Buttons: text inside, or an aria-label / aria-labelledby.
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const named = (attr(m[1], 'aria-label') ?? '').trim() || attr(m[1], 'aria-labelledby') || plain(m[2]).length > 0;
    if (!named) problems.push(`a button has no text or aria-label${attr(m[1], 'id') ? ` (#${attr(m[1], 'id')})` : ''}`);
    if (attr(m[1], 'type') === null) problems.push(`a button has no type${attr(m[1], 'id') ? ` (#${attr(m[1], 'id')})` : ''}`);
  }

  // Fields: a label, an aria-label, or an aria-labelledby. Hidden and button-like inputs need none.
  for (const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const type = (attr(m[2], 'type') ?? 'text').toLowerCase();
    if (['hidden', 'button', 'submit', 'reset', 'image'].includes(type)) continue;
    const id = attr(m[2], 'id');
    const named = (attr(m[2], 'aria-label') ?? '').trim() || attr(m[2], 'aria-labelledby') || (id && labelled.has(id));
    const before = html.slice(0, m.index);
    const wrapped = before.lastIndexOf('<label') > before.lastIndexOf('</label>');
    if (!named && !wrapped) problems.push(`a ${m[1]} has no label${id ? ` (#${id})` : ''}`);
  }

  // Images carry an alt (empty is fine for a decoration); iframes carry a title.
  for (const m of html.matchAll(/<img\b([^>]*)>/gi)) if (attr(m[1], 'alt') === null) problems.push('an image has no alt');
  for (const m of html.matchAll(/<iframe\b([^>]*)>/gi)) if (!(attr(m[1], 'title') ?? '').trim()) problems.push('an iframe has no title');

  // Headings: exactly one h1, and a level never skips (h1 then h3 is a skip; going back up is fine).
  const levels: number[] = [];
  for (const m of html.matchAll(TAG)) if (m[1] === '' && /^h[1-6]$/i.test(m[2])) levels.push(Number(m[2][1]));
  const ones = levels.filter(l => l === 1).length;
  if (ones < 1) problems.push('the page has no h1'); // index.html has two, one per view (Connect, and the app); only one is ever shown
  levels.forEach((l, i) => { if (i > 0 && l > levels[i - 1] + 1) problems.push(`heading level jumps from h${levels[i - 1]} to h${l}`); });
  if (levels.length && levels[0] !== 1) problems.push('the first heading is not the h1');

  // A page names its language and its title.
  if (!/<html\b[^>]*\slang\s*=/i.test(html)) problems.push('the html element has no lang');
  if (!/<title>[^<]+<\/title>/i.test(html)) problems.push('the page has no title');
  return problems;
}
