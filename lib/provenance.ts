import type { Copy, CopyEvent } from './serials-core';
import { isEscrow } from './serials-core';

// A copy's journey (pure, client-safe): its history events turned into steps with who held it when and for how long. Names here are
// raw; the page masks private collectors before showing them.

export type StepKind = 'made' | 'passed' | 'offered' | 'returned' | 'forged' | 'ended' | 'removed';

export interface ProvStep {
  kind: StepKind;
  t: number;
  /** Who it came from / who it went to (viewer logins). */
  from?: string;
  to?: string;
  /** The viewer who held the copy AFTER this step (undefined while it sits in a trade offer or is gone). */
  holder?: string;
  /** How long that holder kept it, until the next step (or until now for the last one). */
  heldMs?: number;
  /** The copy this one was forged into (for an upgrade). */
  into?: string;
}

export interface Provenance {
  steps: ProvStep[];
  /** Everyone who has held it, in order, once each. */
  holders: string[];
  /** Completed trades (the copy changed hands). */
  trades: number;
  /** The holder who kept it longest and for how long. */
  longest: { who: string; ms: number } | null;
  /** Time since it was made. */
  ageMs: number;
  state: 'held' | 'offer' | 'gone';
}

const viewer = (n?: string) => (n && !isEscrow(n) ? n : undefined);

/**
 * `copy.ev` is the full history we kept (the first event plus the latest 40), so a very busy copy may be missing its middle.
 * `now` is a parameter so the result is repeatable.
 */
export function buildProvenance(copy: Pick<Copy, 'ev' | 'owner' | 'at'>, now = Date.now()): Provenance {
  const steps: ProvStep[] = [];
  let holder: string | undefined;
  for (const e of copy.ev as CopyEvent[]) {
    if (e.type === 'minted') { holder = viewer(e.who); steps.push({ kind: 'made', t: e.t, to: holder, holder }); }
    else if (e.type === 'escrowed') { steps.push({ kind: 'offered', t: e.t, from: viewer(e.who) }); holder = undefined; }
    else if (e.type === 'returned') { holder = viewer(e.who); steps.push({ kind: 'returned', t: e.t, to: holder, holder }); }
    else if (e.type === 'traded') { holder = viewer(e.to); steps.push({ kind: 'passed', t: e.t, from: viewer(e.who), to: holder, holder }); }
    else if (e.type === 'upgraded') { steps.push({ kind: 'forged', t: e.t, from: viewer(e.who), into: e.note }); holder = undefined; }
    else if (e.type === 'removed') { steps.push({ kind: 'removed', t: e.t, from: viewer(e.who) }); holder = undefined; }
  }
  const gone = !copy.owner;
  const last = steps[steps.length - 1];

  // How long each holder kept it: from the step that gave it to them until the next step.
  const held = new Map<string, number>();
  steps.forEach((s, i) => {
    if (!s.holder) return;
    const end = steps[i + 1]?.t ?? (gone ? s.t : now);
    s.heldMs = Math.max(0, end - s.t);
    held.set(s.holder, (held.get(s.holder) ?? 0) + s.heldMs);
  });
  const holders: string[] = [];
  for (const s of steps) if (s.holder && !holders.includes(s.holder)) holders.push(s.holder);
  const top = [...held].sort((a, b) => b[1] - a[1])[0];

  return {
    steps,
    holders,
    trades: steps.filter(s => s.kind === 'passed').length,
    longest: top ? { who: top[0], ms: top[1] } : null,
    ageMs: Math.max(0, (gone && last ? last.t : now) - (steps[0]?.t ?? copy.at)),
    state: gone ? 'gone' : isEscrow(copy.owner) ? 'offer' : 'held',
  };
}

/** "3 days", "5 hours", "12 minutes", "under a minute". */
export function spanText(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'under a minute';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'}`;
}
