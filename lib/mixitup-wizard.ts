// The Mix It Up setup wizard's pure parts (ROADMAP 55.1): its steps and which are done. The saved settings and the health data are the
// only state, so reopening the wizard lands on the first step that is not done. scripts/check-mixitup-page.mts covers it.
import type { StatusCard } from './mixitup-page';
import type { MixItUpHealth } from './mixitup-health';

export const STEPS = [
  { id: 'need', label: 'What you need' },
  { id: 'incoming', label: 'Mix It Up to the site' },
  { id: 'outgoing', label: 'The site to Mix It Up' },
  { id: 'rules', label: 'Pull rules' },
  { id: 'events', label: 'Stream events' },
  { id: 'done', label: 'Done' },
] as const;
export type StepId = (typeof STEPS)[number]['id'];

/** Which steps are done. "What you need" counts once anything has connected; "Done" never does, so it is where a finished setup lands. */
export function stepsDone(cards: StatusCard[], health: MixItUpHealth, paidOn: boolean): Record<StepId, boolean> {
  const ok = (id: StatusCard['id']) => cards.find(c => c.id === id)?.tone === 'ok';
  return { need: ok('incoming') || ok('outgoing'), incoming: ok('incoming'), outgoing: ok('outgoing'), rules: paidOn, events: !!health.seen['/api/webhooks/stream']?.okAt, done: false };
}

/** The step the address asks for, or the first one that is not done. */
export const pickStep = (raw: string | undefined, done: Record<StepId, boolean>): StepId =>
  STEPS.find(s => s.id === raw)?.id ?? STEPS.find(s => !done[s.id])!.id;
