// FAQ Editor checks (ROADMAP 31.1 / GitHub Issue #294):
// - Pure validation (question title, answer, section ID, title caps, slug formatting)
// - Store normalization (preserves built-in sections, restores missing sections, preserves custom sections and questions)
// - Reordering sections and reordering questions within sections
// - Text answer parsing (paragraphs, bullet lists, markdown bold and links)
// - KV operations on mock database (get, upsert, reorder, delete, reset)
// Needs the mock KV (npm run check starts it); refuses anything non-local. Run: npx tsx scripts/check-faq.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const core = await import('../lib/faq-core');
const faq = await import('../lib/faq');
const { kv } = await import('../lib/db');

// ── 1. Defaults and Built-in sections ──
const defaults = core.getDefaultFaqStore();
eq(defaults.sections.length, 12, 'default store has 12 built-in sections');
ok(defaults.sections.every(s => s.builtin), 'all default sections are marked builtin');
eq(defaults.questions.length, 0, 'default store starts with zero custom questions');

// ── 2. Normalization ──
const fromNull = core.normalizeFaqStore(null);
eq(fromNull.sections.length, 12, 'normalizing null returns defaults');

const partial = core.normalizeFaqStore({
  sections: [
    { id: 'custom-sec', title: 'Custom Section', icon: 'star' },
    { id: 'points', title: 'Points Custom Name', icon: 'trophy' },
  ],
  questions: [
    { id: 'q1', sectionId: 'custom-sec', question: 'How to play?', answer: 'Play on stream' },
  ],
});

eq(partial.sections.length, 13, 'custom section kept and all missing built-in sections restored');
eq(partial.sections[0].id, 'custom-sec', 'custom ordering preserved');
eq(partial.sections[1].id, 'points', 'built-in section with customized title preserved in its position');
eq(partial.sections[1].title, 'Points Custom Name', 'custom title applied to built-in section');
eq(partial.questions.length, 1, 'valid question normalized');

// ── 3. Question validation ──
const emptyQ = core.cleanQuestionInput({ sectionId: 'start', question: '', answer: 'ans' }, 'id-1');
ok(!emptyQ.ok, 'empty question title rejected');

const longQ = core.cleanQuestionInput({ sectionId: 'start', question: 'a'.repeat(201), answer: 'ans' }, 'id-2');
ok(!longQ.ok, 'question title > 200 chars rejected');

const emptyAns = core.cleanQuestionInput({ sectionId: 'start', question: 'Valid?', answer: '' }, 'id-3');
ok(!emptyAns.ok, 'empty answer rejected');

const validQ = core.cleanQuestionInput({ sectionId: 'start', question: 'Valid Question?', answer: 'Valid answer.' }, 'id-4');
ok(validQ.ok && validQ.question.question === 'Valid Question?' && validQ.question.enabled, 'valid question cleaned successfully');

// ── 4. Section validation ──
const badSlug = core.cleanSectionInput({ id: 'INVALID SLUG!', title: 'Title' });
ok(!badSlug.ok, 'invalid section slug rejected');

const emptyTitle = core.cleanSectionInput({ id: 'valid-slug', title: '' });
ok(!emptyTitle.ok, 'empty section title rejected');

const validSec = core.cleanSectionInput({ id: 'tournaments', title: 'Tournaments', icon: 'trophy' });
ok(validSec.ok && validSec.section.id === 'tournaments' && !validSec.section.builtin, 'valid custom section cleaned successfully');

// ── 5. Answer formatting parsing ──
const sampleAnswer = `
First paragraph about the game.

Second paragraph with **bold text** and a [Terms link](/terms).

- First rule
- Second rule
- Third rule
`;

const blocks = core.parseFaqAnswerBlocks(sampleAnswer);
eq(blocks.length, 3, 'parsed 3 blocks (2 paragraphs and 1 list)');
ok(blocks[0].type === 'p' && blocks[0].text.includes('First paragraph'), 'first paragraph parsed');
ok(blocks[1].type === 'p' && blocks[1].text.includes('Second paragraph'), 'second paragraph parsed');
ok(blocks[2].type === 'ul' && blocks[2].items.length === 3, 'unordered list parsed with 3 items');

const tokens = core.parseInlineTokens('Check **important** or visit [Site](/site) now');
eq(tokens.length, 5, 'inline tokens parsed');
eq(tokens[1], { type: 'bold', content: 'important' }, 'bold token parsed');
eq(tokens[3], { type: 'link', content: 'Site', href: '/site' }, 'link token parsed');

// ── 6. KV CRUD operations against mock database ──
// Reset first
await faq.resetFaqStore();
const initialStore = await faq.getFaqStore();
eq(initialStore.sections.length, 12, 'initial store has 12 sections');
eq(initialStore.questions.length, 0, 'initial store has 0 questions');

// Create custom section
await faq.upsertFaqSection({
  id: 'events',
  title: 'Special Events',
  icon: 'calendar',
});
let store = await faq.getFaqStore();
eq(store.sections.length, 13, 'section added to store');
ok(store.sections.some(s => s.id === 'events'), 'events section exists');

// Add questions to sections
await faq.upsertFaqQuestion({
  id: 'q-events-1',
  sectionId: 'events',
  question: 'When is the next tournament?',
  answer: 'Check announcements on Discord.',
  enabled: true,
});

await faq.upsertFaqQuestion({
  id: 'q-events-2',
  sectionId: 'events',
  question: 'Are there prizes?',
  answer: 'Yes, special packs and badges.',
  enabled: true,
});

store = await faq.getFaqStore();
eq(store.questions.length, 2, '2 custom questions added');

// Reorder questions
await faq.reorderFaqQuestions('events', ['q-events-2', 'q-events-1']);
store = await faq.getFaqStore();
const qEvents = store.questions.filter(q => q.sectionId === 'events').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
eq(qEvents[0].id, 'q-events-2', 'q-events-2 moved to first position');
eq(qEvents[1].id, 'q-events-1', 'q-events-1 moved to second position');

// Reorder sections
await faq.reorderFaqSections(['events', 'points', 'start']);
store = await faq.getFaqStore();
eq(store.sections[0].id, 'events', 'events is now the first section block');
eq(store.sections[1].id, 'points', 'points is second section block');
eq(store.sections[2].id, 'start', 'start is third section block');

// Toggle section visibility
await faq.setFaqSectionHidden('events', true);
store = await faq.getFaqStore();
ok(store.sections.find(s => s.id === 'events')?.hidden, 'events section marked hidden');

// Refuse deleting section with questions
const delRes1 = await faq.deleteFaqSection('events');
ok(!delRes1.ok, 'cannot delete section with questions');

// Delete questions
await faq.deleteFaqQuestion('q-events-1');
await faq.deleteFaqQuestion('q-events-2');
store = await faq.getFaqStore();
eq(store.questions.length, 0, 'questions deleted');

// Delete empty custom section
const delRes2 = await faq.deleteFaqSection('events');
ok(delRes2.ok, 'empty custom section deleted');

// Refuse deleting built-in section
const delBuiltin = await faq.deleteFaqSection('start');
ok(!delBuiltin.ok, 'cannot delete built-in section');

// Clean up
await faq.resetFaqStore();
console.log('check-faq.mts passed');
