// Importing a folder of art into a pack (ROADMAP 20.2e): reading file names and planning what each file becomes. Pure and client-safe; the
// review table shows this plan before anything is uploaded or created.

export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] as const;
export const SOUND_EXT = ['mp3', 'wav', 'ogg'] as const;
export const MAX_IMPORT_FILES = 100;
/** Pictures and sounds other than GIFs are posted through the app (4.5 MB request limit); GIFs go straight to storage. */
export const MAX_POSTED_BYTES = 4 * 1024 * 1024;
export const MAX_GIF_BYTES = 60 * 1024 * 1024;

export interface ParsedArtName {
  kind: 'art' | 'fullart' | 'sound' | 'other';
  /** A leading number ("012 Gouda Goat"), if any. */
  number?: number;
  /** The card's name, tidied: "Gouda Goat". */
  title: string;
  /** What files of the same card share (lower case, no number, no full-art suffix), for matching full art and sounds to a card. */
  key: string;
  ext: string;
}

const FULL_ART = /(?:[\s._-]+|^)(?:fa|full[\s._-]?art|fullart)$/i;
const titleCase = (s: string) => s.split(' ').filter(Boolean).map(w => (w.length > 1 && w === w.toUpperCase() && /[A-Z]{2,}/.test(w) ? w : w[0].toUpperCase() + w.slice(1).toLowerCase())).join(' ');

/**
 * `012 Gouda Goat.webp`, `12-gouda-goat.gif` and `gouda_goat.png` all become the card "Gouda Goat" (the first two with the number 12). A
 * `-fa`, `_fullart` or ` full art` suffix makes the picture the full art of the card with the same name; an audio file with the same name
 * is that card's sound.
 */
export function parseArtFileName(fileName: string): ParsedArtName {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
  let stem = dot > 0 ? base.slice(0, dot) : base;
  const isImage = (IMAGE_EXT as readonly string[]).includes(ext);
  const isSound = (SOUND_EXT as readonly string[]).includes(ext);
  if (!isImage && !isSound) return { kind: 'other', title: stem, key: stem.toLowerCase(), ext };
  let full = false;
  if (isImage && FULL_ART.test(stem)) {
    const rest = stem.replace(FULL_ART, '');
    if (rest.replace(/^d+[s._-]*/, '').trim()) { full = true; stem = rest; } // a file called just "fa" is a card, not full art of nothing
  }
  let number: number | undefined;
  const m = /^(\d{1,6})(?:[\s._-]+|$)/.exec(stem);
  if (m) { number = Number(m[1]); stem = stem.slice(m[0].length); }
  const title = titleCase(stem.replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 80);
  return { kind: isSound ? 'sound' : full ? 'fullart' : 'art', number: number && number > 0 ? number : undefined, title, key: title.toLowerCase(), ext };
}

export interface ImportFile { name: string; size: number; type?: string }
export interface ExistingCard { id: string; number: number; name: string }

export interface ImportRow {
  /** Index of the file in the dropped list. */
  file: number;
  kind: 'new' | 'fullart' | 'sound';
  /** New cards: the number it will get and its name (both editable in the review table). */
  number: number;
  name: string;
  /** For full art and sound: the card it belongs to (an existing card's id, or the file index of the new card in this drop). */
  target?: { existing: string } | { file: number };
  targetName?: string;
  problems: string[];
  /** Left out of the import (a file this tool cannot use). */
  skip: boolean;
}

/**
 * What each dropped file becomes. New cards take their leading number when it is free in the pack (else the next free one); full art and
 * sounds attach to the card of the same name, in this drop or already in the pack. Files that match nothing, or cannot be used, are listed
 * with the reason.
 */
export function planImport(files: ImportFile[], existing: ExistingCard[]): ImportRow[] {
  const parsed = files.map(f => parseArtFileName(f.name));
  const used = new Set(existing.map(c => c.number));
  let next = Math.max(0, ...used);
  const byKey = new Map<string, { file: number } | { existing: string }>();
  for (const c of existing) byKey.set(c.name.trim().toLowerCase(), { existing: c.id });
  const rows: ImportRow[] = [];
  const newByFile = new Map<number, ImportRow>();

  // New cards first (so full art and sounds can find them), in file-name order for stable numbering.
  const order = files.map((_, i) => i).sort((a, b) => files[a].name.localeCompare(files[b].name, undefined, { numeric: true }));
  const names = new Set(existing.map(c => c.name.trim().toLowerCase()));
  for (const i of order) {
    const p = parsed[i];
    if (p.kind !== 'art') continue;
    const problems: string[] = [];
    let number = p.number && !used.has(p.number) ? p.number : 0;
    if (p.number && used.has(p.number)) problems.push(`#${p.number} is already used, so the next free number is given.`);
    if (!number) { while (used.has(++next)) { /* next free */ } number = next; }
    used.add(number);
    if (!p.title) problems.push('No name could be read from the file name.');
    else if (names.has(p.key)) problems.push('A card with this name already exists.');
    names.add(p.key);
    const f = files[i];
    const isGif = p.ext === 'gif';
    if (isGif ? f.size > MAX_GIF_BYTES : f.size > MAX_POSTED_BYTES) problems.push(`The file is too big (${Math.round(f.size / 1024 / 1024)} MB; the limit is ${isGif ? MAX_GIF_BYTES / 1024 / 1024 : 4} MB).`);
    const row: ImportRow = { file: i, kind: 'new', number, name: p.title, problems, skip: false };
    rows.push(row);
    newByFile.set(i, row);
    if (!byKey.has(p.key)) byKey.set(p.key, { file: i });
  }
  for (const i of order) {
    const p = parsed[i];
    const f = files[i];
    if (p.kind === 'other') { rows.push({ file: i, kind: 'new', number: 0, name: p.title, problems: ['Not a picture or sound this tool can use (png, jpg, webp, gif, avif, mp3, wav, ogg).'], skip: true }); continue; }
    if (p.kind === 'art') continue;
    const target = byKey.get(p.key);
    const problems: string[] = [];
    const tooBig = f.size > (p.ext === 'gif' ? MAX_GIF_BYTES : MAX_POSTED_BYTES);
    if (tooBig) problems.push(`The file is too big (${Math.round(f.size / 1024 / 1024)} MB).`);
    if (!target) problems.push(`No card named "${p.title}" in this pack or this drop to attach it to.`);
    rows.push({
      file: i, kind: p.kind === 'fullart' ? 'fullart' : 'sound', number: 0, name: p.title, target, problems, skip: !target,
      targetName: target ? ('file' in target ? newByFile.get(target.file)?.name : existing.find(c => c.id === (target as { existing: string }).existing)?.name) : undefined,
    });
  }
  return rows.slice(0, MAX_IMPORT_FILES * 2);
}

/** Problems that stop a row from being imported (the review table unticks it): too big, nothing to attach to. */
export const blocked = (r: ImportRow) => r.skip || r.problems.some(p => /too big|No card named|No name/.test(p));
