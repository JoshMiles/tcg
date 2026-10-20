import { ICONS, type IconName } from '@/app/components/Icon';
import { FAQ_BUILTINS, getFaqBuiltin } from './faq-builtins';

export interface FaqSectionMeta {
  id: string;
  title: string;
  icon: IconName;
  builtin?: boolean;
  hidden?: boolean;
}

export interface FaqQuestion {
  id: string;
  sectionId: string;
  question: string;
  answer: string;
  order?: number;
  enabled?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

/** Staff changes to a built-in question. A field that is missing means "use the built-in text". */
export interface FaqOverride {
  question?: string;
  answer?: string;
  hidden?: boolean;
}

export interface FaqStoreData {
  sections: FaqSectionMeta[];
  questions: FaqQuestion[];
  /** Keyed by built-in question id (lib/faq-builtins.ts). */
  overrides: Record<string, FaqOverride>;
}

/** Live blocks an answer can show on a line of its own as {{name}} (rendered by app/(site)/faq/blocks.tsx). */
export const FAQ_BLOCK_NAMES = ['chat_commands', 'rarities', 'points_formula', 'card_values'] as const;
export type FaqBlockName = (typeof FAQ_BLOCK_NAMES)[number];

export type FaqValues = Record<string, string>;

/** A stored icon name that is not in the icon set would crash the page, so anything unknown becomes the fallback. */
export function cleanIconName(value: unknown, fallback: IconName = 'help'): IconName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ICONS, value) ? (value as IconName) : fallback;
}

export const QUESTION_TITLE_MAX = 200;
export const QUESTION_ANSWER_MAX = 10000;
export const SECTION_TITLE_MAX = 60;
export const SECTION_ID_MAX = 40;

export const DEFAULT_FAQ_SECTIONS: FaqSectionMeta[] = [
  { id: 'start', title: 'Getting started', icon: 'cheese', builtin: true },
  { id: 'commands', title: 'Chat commands', icon: 'chat', builtin: true },
  { id: 'cards', title: 'Cards & versions', icon: 'cards', builtin: true },
  { id: 'trading', title: 'Trading', icon: 'trade', builtin: true },
  { id: 'upgrades', title: 'Upgrading', icon: 'sparkles', builtin: true },
  { id: 'profile', title: 'Your profile', icon: 'user', builtin: true },
  { id: 'show', title: 'Showing off', icon: 'tv', builtin: true },
  { id: 'points', title: 'Points & leaderboard', icon: 'trophy', builtin: true },
  { id: 'seasons', title: 'Seasons', icon: 'calendar', builtin: true },
  { id: 'extension', title: 'Twitch extension', icon: 'puzzle', builtin: true },
  { id: 'privacy', title: 'Privacy & data', icon: 'lock', builtin: true },
  { id: 'help', title: 'Something not working?', icon: 'wrench', builtin: true },
];

export function getDefaultFaqStore(): FaqStoreData {
  return {
    sections: DEFAULT_FAQ_SECTIONS.map(s => ({ ...s })),
    questions: [],
    overrides: {},
  };
}

const sameText = (a: string, b: string) => a.replace(/\r\n/g, '\n').trim() === b.replace(/\r\n/g, '\n').trim();

/** Cleans one override: unknown ids give null, text equal to the built-in text is dropped, and an override with nothing left is null. */
export function normalizeFaqOverride(id: string, raw: unknown): FaqOverride | null {
  const builtin = getFaqBuiltin(id);
  if (!builtin || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: FaqOverride = {};
  const question = typeof r.question === 'string' ? r.question.trim().slice(0, QUESTION_TITLE_MAX) : '';
  const answer = typeof r.answer === 'string' ? r.answer.replace(/\r\n/g, '\n').trim().slice(0, QUESTION_ANSWER_MAX) : '';
  if (question && !sameText(question, builtin.question)) out.question = question;
  if (answer && !sameText(answer, builtin.answer)) out.answer = answer;
  if (r.hidden === true) out.hidden = true;
  return Object.keys(out).length ? out : null;
}

export function normalizeFaqStore(raw: unknown): FaqStoreData {
  const defaults = getDefaultFaqStore();
  if (!raw || typeof raw !== 'object') return defaults;

  const r = raw as Record<string, unknown>;
  const rawSections = Array.isArray(r.sections) ? r.sections : [];
  const rawQuestions = Array.isArray(r.questions) ? r.questions : [];

  // Parse sections
  const sections: FaqSectionMeta[] = [];
  const seenIds = new Set<string>();

  for (const s of rawSections) {
    if (!s || typeof s !== 'object') continue;
    const item = s as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id.trim().toLowerCase() : '';
    if (!id || seenIds.has(id)) continue;

    const builtinDefault = DEFAULT_FAQ_SECTIONS.find(d => d.id === id);
    const title = typeof item.title === 'string' && item.title.trim()
      ? item.title.trim().slice(0, SECTION_TITLE_MAX)
      : (builtinDefault?.title ?? id);
    const icon = cleanIconName(item.icon, builtinDefault?.icon ?? 'help');
    const builtin = !!builtinDefault;
    const hidden = item.hidden === true;

    sections.push({ id, title, icon, builtin, hidden });
    seenIds.add(id);
  }

  // Ensure all built-in sections exist even if omitted from stored data
  for (const def of DEFAULT_FAQ_SECTIONS) {
    if (!seenIds.has(def.id)) {
      sections.push({ ...def });
      seenIds.add(def.id);
    }
  }

  // Parse questions
  const questions: FaqQuestion[] = [];
  for (const q of rawQuestions) {
    if (!q || typeof q !== 'object') continue;
    const item = q as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const sectionId = typeof item.sectionId === 'string' ? item.sectionId.trim().toLowerCase() : '';
    const question = typeof item.question === 'string' ? item.question.trim().slice(0, QUESTION_TITLE_MAX) : '';
    const answer = typeof item.answer === 'string' ? item.answer.trim().slice(0, QUESTION_ANSWER_MAX) : '';
    if (!id || !sectionId || !question || !answer) continue;

    const order = typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : questions.length;
    const enabled = item.enabled !== false;
    const createdAt = typeof item.createdAt === 'number' ? item.createdAt : Date.now();
    const updatedAt = typeof item.updatedAt === 'number' ? item.updatedAt : Date.now();

    questions.push({
      id,
      sectionId,
      question,
      answer,
      order,
      enabled,
      createdAt,
      updatedAt,
    });
  }

  // Stable sort by order
  questions.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const overrides: Record<string, FaqOverride> = {};
  const rawOverrides = r.overrides && typeof r.overrides === 'object' && !Array.isArray(r.overrides) ? (r.overrides as Record<string, unknown>) : {};
  for (const b of FAQ_BUILTINS) {
    const o = normalizeFaqOverride(b.id, rawOverrides[b.id]);
    if (o) overrides[b.id] = o;
  }

  return { sections, questions, overrides };
}

export function cleanQuestionInput(
  input: unknown,
  id: string,
  sectionIds: readonly string[],
):{ ok: true; question: FaqQuestion } | { ok: false; message: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, message: 'Invalid question payload.' };
  }
  const r = input as Record<string, unknown>;
  const sectionId = typeof r.sectionId === 'string' ? r.sectionId.trim().toLowerCase() : '';
  const question = typeof r.question === 'string' ? r.question.trim() : '';
  const answer = typeof r.answer === 'string' ? r.answer.trim() : '';
  const enabled = r.enabled !== false;

  if (!sectionId) return { ok: false, message: 'Section is required.' };
  if (!sectionIds.includes(sectionId)) return { ok: false, message: 'That section does not exist.' };
  if (!question) return { ok: false, message: 'Question cannot be empty.' };
  if (question.length > QUESTION_TITLE_MAX) {
    return { ok: false, message: `Question must be ${QUESTION_TITLE_MAX} characters or fewer.` };
  }
  if (!answer) return { ok: false, message: 'Answer cannot be empty.' };
  if (answer.length > QUESTION_ANSWER_MAX) {
    return { ok: false, message: `Answer must be ${QUESTION_ANSWER_MAX} characters or fewer.` };
  }

  const now = Date.now();
  return {
    ok: true,
    question: {
      id,
      sectionId,
      question,
      answer,
      enabled,
      order: typeof r.order === 'number' ? r.order : 0,
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
      updatedAt: now,
    },
  };
}

export function cleanSectionInput(
  input: unknown,
): { ok: true; section: FaqSectionMeta } | { ok: false; message: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, message: 'Invalid section payload.' };
  }
  const r = input as Record<string, unknown>;
  const rawId = typeof r.id === 'string' ? r.id.trim().toLowerCase() : '';
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  const icon = cleanIconName(typeof r.icon === 'string' ? r.icon.trim() : '');

  if (!rawId) return { ok: false, message: 'Section identifier is required.' };
  if (!/^[a-z0-9_-]{2,40}$/.test(rawId)) {
    return { ok: false, message: 'Section identifier must be 2 to 40 lowercase letters, numbers, hyphens or underscores.' };
  }
  if (!title) return { ok: false, message: 'Section title is required.' };
  if (title.length > SECTION_TITLE_MAX) {
    return { ok: false, message: `Section title must be ${SECTION_TITLE_MAX} characters or fewer.` };
  }

  return {
    ok: true,
    section: {
      id: rawId,
      title,
      icon,
      builtin: DEFAULT_FAQ_SECTIONS.some(d => d.id === rawId),
      hidden: r.hidden === true,
    },
  };
}

export function reorderArray<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
    return [...items];
  }
  const result = [...items];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

export interface ParsedParagraph {
  type: 'p';
  text: string;
}

export interface ParsedList {
  type: 'ul';
  items: string[];
}

export type ParsedBlock = ParsedParagraph | ParsedList;

/** Splits markdown-like text into structured paragraphs and bullet lists. */
export function parseFaqAnswerBlocks(text: string): ParsedBlock[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const rawBlocks = normalized.split(/\n\s*\n+/);
  const blocks: ParsedBlock[] = [];

  for (const block of rawBlocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    // Check if every line is a bullet item
    const isBulletList = lines.every(l => /^[-*•]\s+/.test(l));
    if (isBulletList) {
      blocks.push({
        type: 'ul',
        items: lines.map(l => l.replace(/^[-*•]\s+/, '')),
      });
    } else {
      // Paragraph with joined lines
      blocks.push({
        type: 'p',
        text: lines.join(' '),
      });
    }
  }

  return blocks;
}

export type InlineToken =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'code'; content: string }
  | { type: 'link'; content: string; href: string };

export function parseInlineTokens(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // Links go to a full URL, a site path (one slash: //host is another site), an in-page #anchor or a mailto: address.
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/(?!\/)[^\s)]*|#[\w-]+|mailto:[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined && match[2] !== undefined) {
      tokens.push({ type: 'link', content: match[1], href: match[2] });
    } else if (match[3] !== undefined) {
      tokens.push({ type: 'bold', content: match[3] });
    } else if (match[4] !== undefined) {
      tokens.push({ type: 'italic', content: match[4] });
    } else if (match[5] !== undefined) {
      tokens.push({ type: 'code', content: match[5] });
    }
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return tokens;
}

const BLOCK_LINE = /^\s*\{\{([a-z][a-z0-9_]*)\}\}\s*$/;
const PLACEHOLDER = /\{([a-z][a-z0-9_]*)\}/g;
const has = (values: FaqValues, key: string) => Object.prototype.hasOwnProperty.call(values, key);

export type FaqAnswerPart = { type: 'text'; text: string } | { type: 'block'; name: string };

/** Fills {placeholders}. An unknown {word} stays as typed, and a line holding only a placeholder whose value is empty is dropped. */
export function fillFaqPlaceholders(text: string, values: FaqValues): string {
  return text
    .split('\n')
    .filter(line => {
      const m = /^\s*\{([a-z][a-z0-9_]*)\}\s*$/.exec(line);
      return !(m && has(values, m[1]) && values[m[1]] === '');
    })
    .join('\n')
    .replace(PLACEHOLDER, (all, key: string) => (has(values, key) ? values[key] : all));
}

/** Splits an answer at its {{block}} lines and fills the placeholders in the text between them. */
export function splitFaqAnswer(answer: string, values: FaqValues): FaqAnswerPart[] {
  const parts: FaqAnswerPart[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length) parts.push({ type: 'text', text: fillFaqPlaceholders(run.join('\n'), values) });
    run = [];
  };
  for (const line of answer.replace(/\r\n/g, '\n').split('\n')) {
    const m = BLOCK_LINE.exec(line);
    if (m) {
      flush();
      parts.push({ type: 'block', name: m[1] });
    } else {
      run.push(line);
    }
  }
  flush();
  return parts;
}

/** The {placeholders} and {{blocks}} in a text that nothing defines, so the editor can warn before they show up as typed. */
export function findFaqProblems(text: string, values: FaqValues): { placeholders: string[]; blocks: string[] } {
  const placeholders = new Set<string>();
  const blocks = new Set<string>();
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const m = BLOCK_LINE.exec(line);
    if (m) {
      if (!(FAQ_BLOCK_NAMES as readonly string[]).includes(m[1])) blocks.add(m[1]);
      continue;
    }
    for (const p of line.matchAll(PLACEHOLDER)) if (!has(values, p[1])) placeholders.add(p[1]);
  }
  return { placeholders: [...placeholders], blocks: [...blocks] };
}

