import { entryOf, escrowOwner } from './serials-core';
import type { Trade, TradeItem } from './trade-core';
import { decodeEntry, encodeEntry, VARIANTS } from './variants';
import type { Variant } from './types';

// Read-only classification of trade and restore ledger drift. No KV calls: scripts/audit-trade-ledger.mts loads
// the rows and passes them in. History keeps 400 finished offers, so anything older than that is invisible here.

export interface AuditCopy {
  id: string;
  owner: string;
  card: number;
  variant: Variant;
  n: number;
  origin: string;
  at: number;
  ev: { t: number; type: string; who?: string }[];
}

export interface AuditSeason {
  id: string;
  name: string;
  collectionName: string;
  tracking: boolean;
}

export interface AuditInput {
  seasons: AuditSeason[];
  open: Trade[];
  history: Trade[];
  /** collection name -> viewer -> collection entries */
  collections: Record<string, Record<string, number[]>>;
  /** collection name -> owner (viewer or escrow:<id>) -> live copies */
  copies: Record<string, Record<string, AuditCopy[]>>;
  /** collection name -> retired copies */
  retired: Record<string, AuditCopy[]>;
}

export interface LedgerFinding {
  tradeId?: string;
  username?: string;
  seasonId?: string;
  seasonName?: string;
  detail: string;
}

export interface AuditReport {
  /** Closed, still marked escrowed, and a returned event shows the prints already came back. */
  refunded: LedgerFinding[];
  /** Open offers whose season record is gone. */
  openDeletedSeason: LedgerFinding[];
  /** A second set may have been minted by a count-based restore. Confirm before removing anything. */
  restoreDuplicates: LedgerFinding[];
  /** Flag is honest: the editions are still in escrow. */
  stillHeld: LedgerFinding[];
  /** Some of the give side is still in escrow and some is not. */
  partial: LedgerFinding[];
  /** Escrow hash is empty, but no returned event confirms the refund. */
  unconfirmed: LedgerFinding[];
  /** Season is not numbered, so escrow cannot be checked. */
  unnumbered: LedgerFinding[];
  /** Closed and still marked escrowed, and the season record is gone. */
  seasonMissing: LedgerFinding[];
}

export interface RepairAction {
  tradeId: string;
  action: 'clear-flag' | 'return-prints' | 'manual';
  reason: string;
}

const RETURN_WINDOW_MS = 120_000;

export function emptyReport(): AuditReport {
  return { refunded: [], openDeletedSeason: [], restoreDuplicates: [], stillHeld: [], partial: [], unconfirmed: [], unnumbered: [], seasonMissing: [] };
}

export function parseAuditCopy(value: unknown): AuditCopy | null {
  try {
    const x = (typeof value === 'string' ? JSON.parse(value) : value) as Partial<AuditCopy> | null;
    if (!x || typeof x.id !== 'string' || typeof x.card !== 'number' || !VARIANTS.includes(x.variant as Variant)) return null;
    const ev = Array.isArray(x.ev) ? x.ev.filter(e => !!e && typeof e.t === 'number' && typeof e.type === 'string') : [];
    return {
      id: x.id, owner: typeof x.owner === 'string' ? x.owner : '', card: x.card, variant: x.variant as Variant,
      n: typeof x.n === 'number' ? x.n : 0, origin: typeof x.origin === 'string' ? x.origin : 'other', at: typeof x.at === 'number' ? x.at : 0, ev,
    };
  } catch {
    return null;
  }
}

/** True when some print of this offer's give side has a `returned` event for the offerer, close to when the offer closed. */
export function refundEvidence(trade: Trade, copies: Pick<AuditCopy, 'card' | 'variant' | 'ev'>[]): boolean {
  if (!trade.resolvedAt) return false;
  const entries = new Set(trade.give.map(itemEntry));
  const lo = trade.resolvedAt - 5_000;
  const hi = trade.resolvedAt + RETURN_WINDOW_MS;
  return copies.some(c => entries.has(entryOf(c)) && c.ev.some(e => e.type === 'returned' && e.who === trade.from && e.t >= lo && e.t <= hi));
}

function itemEntry(item: TradeItem): number {
  return encodeEntry(item.cardNumber, item.variant);
}

/** How many of the give side these copies cover. Exact ids count only those ids. */
export function heldGiveCount(copies: AuditCopy[], give: TradeItem[]): number {
  let n = 0;
  for (const item of give) {
    const entry = itemEntry(item);
    const mine = copies.filter(c => entryOf(c) === entry);
    n += item.ids ? mine.filter(c => item.ids!.includes(c.id)).length : Math.min(item.count, mine.length);
  }
  return n;
}

function entryCount(entries: number[] | undefined, entry: number): number {
  return (entries ?? []).filter(e => e === entry).length;
}

function finding(trade: Trade, season: AuditSeason | undefined, detail: string): LedgerFinding {
  return { tradeId: trade.id, username: trade.from, seasonId: trade.seasonId, seasonName: season?.name, detail };
}

/**
 * Classify already-loaded rows. `refunded` is only used when a returned event confirms the prints came back,
 * so an empty escrow hash alone is not treated as a refund.
 */
export function auditLedger(input: AuditInput): AuditReport {
  const report = emptyReport();
  const seasons = new Map(input.seasons.map(s => [s.id, s]));
  const dupKeys = new Set<string>();

  for (const trade of input.open) {
    if (seasons.has(trade.seasonId)) continue;
    report.openDeletedSeason.push(finding(trade, undefined, `${trade.from} offered ${trade.give.map(g => `${g.count}× #${g.cardNumber} ${g.variant}`).join(', ')}; season ${trade.seasonId} is not in the season list`));
  }

  for (const trade of input.history) {
    if (!trade.escrowed) continue;
    const season = seasons.get(trade.seasonId);
    if (!season) {
      report.seasonMissing.push(finding(trade, undefined, `closed as ${trade.status}, still marked escrowed, season ${trade.seasonId} is gone`));
      continue;
    }
    if (!season.tracking) {
      report.unnumbered.push(finding(trade, season, 'season is not numbered, so the audit cannot see whether the editions are still in escrow'));
      continue;
    }
    const bucket = input.copies[season.collectionName] ?? {};
    const escrow = bucket[escrowOwner(trade.id)] ?? [];
    const everyone = [...Object.values(bucket).flat(), ...(input.retired[season.collectionName] ?? [])];
    const expected = trade.give.reduce((n, i) => n + i.count, 0);
    const held = heldGiveCount(escrow, trade.give);
    if (held === 0 && refundEvidence(trade, everyone)) {
      report.refunded.push(finding(trade, season, `escrow holds 0 of ${expected}; a returned event for ${trade.from} sits next to the close`));
    } else if (held === 0) {
      report.unconfirmed.push(finding(trade, season, `escrow holds 0 of ${expected}, and no returned event confirms they came back`));
    } else if (held < expected) {
      report.partial.push(finding(trade, season, `escrow still holds ${held} of ${expected}`));
    } else {
      report.stillHeld.push(finding(trade, season, `escrow still holds ${held} of ${expected}`));
    }
  }

  for (const season of input.seasons) {
    if (!season.tracking) continue;
    const bucket = input.copies[season.collectionName] ?? {};
    const retired = input.retired[season.collectionName] ?? [];
    const collection = input.collections[season.collectionName] ?? {};
    const pushDup = (key: string, row: LedgerFinding) => {
      if (dupKeys.has(key)) return;
      dupKeys.add(key);
      report.restoreDuplicates.push(row);
    };

    for (const trade of input.open) {
      if (trade.seasonId !== season.id || !trade.escrowed) continue;
      const escrow = bucket[escrowOwner(trade.id)] ?? [];
      const mine = bucket[trade.from] ?? [];
      for (const item of trade.give) {
        const entry = itemEntry(item);
        const inEscrow = escrow.filter(c => entryOf(c) === entry).length;
        if (inEscrow === 0) continue;
        const extras = mine.filter(c => entryOf(c) === entry && c.origin === 'other' && c.at >= trade.createdAt);
        if (extras.length === 0) continue;
        const have = entryCount(collection[trade.from], entry);
        pushDup(`${season.id}|${trade.from}|${entry}|${trade.id}`, {
          tradeId: trade.id, username: trade.from, seasonId: season.id, seasonName: season.name,
          detail: `#${item.cardNumber} ${item.variant}: escrow on ${trade.id} holds ${inEscrow}, and ${trade.from} holds ${extras.length} other edition${extras.length === 1 ? '' : 's'} minted after the offer (collection has ${have})`,
        });
      }
    }

    for (const [user, owned] of Object.entries(collection)) {
      const mine = bucket[user] ?? [];
      const groups = new Map<number, AuditCopy[]>();
      for (const c of mine) {
        const e = entryOf(c);
        groups.set(e, [...(groups.get(e) ?? []), c]);
      }
      for (const [entry, copies] of groups) {
        const extras = copies.filter(c => c.origin === 'other' && !c.ev.some(e => e.type === 'returned' || e.type === 'restored'));
        if (extras.length === 0) continue;
        const { cardNumber, variant } = decodeEntry(entry);
        const retiredMine = retired.filter(c => entryOf(c) === entry && c.ev.at(-1)?.type === 'removed' && c.ev.at(-1)?.who === user);
        const mintedAt = Math.min(...extras.map(c => c.at));
        const retiredAt = retiredMine.length ? Math.max(...retiredMine.map(c => c.ev.at(-1)?.t ?? 0)) : 0;
        if (retiredMine.length >= extras.length && mintedAt + 2_000 >= retiredAt) {
          pushDup(`${season.id}|${user}|${entry}|retired`, {
            username: user, seasonId: season.id, seasonName: season.name,
            detail: `#${cardNumber} ${variant}: ${user} holds ${extras.length} edition${extras.length === 1 ? '' : 's'} minted as other, and ${retiredMine.length} retired edition${retiredMine.length === 1 ? '' : 's'} of that card were removed from them first (collection has ${entryCount(owned, entry)})`,
          });
          continue;
        }
        const returned = copies.filter(c => c.ev.some(e => e.type === 'returned' && e.who === user));
        const after = returned.length ? Math.max(...returned.flatMap(c => c.ev.filter(e => e.type === 'returned').map(e => e.t))) : 0;
        const later = extras.filter(c => c.at >= after);
        if (returned.length > 0 && later.length > 0) {
          pushDup(`${season.id}|${user}|${entry}|returned`, {
            username: user, seasonId: season.id, seasonName: season.name,
            detail: `#${cardNumber} ${variant}: ${user} holds ${returned.length} edition${returned.length === 1 ? '' : 's'} that came back from a trade and ${later.length} later edition${later.length === 1 ? '' : 's'} minted as other (collection has ${entryCount(owned, entry)})`,
          });
        }
      }
    }
  }
  return report;
}

/** Safe repairs only. Duplicates and anything unconfirmed stay manual. */
export function planRepairs(report: AuditReport): RepairAction[] {
  const actions: RepairAction[] = [];
  for (const f of report.refunded) if (f.tradeId) actions.push({ tradeId: f.tradeId, action: 'clear-flag', reason: f.detail });
  for (const f of report.stillHeld) if (f.tradeId) actions.push({ tradeId: f.tradeId, action: 'return-prints', reason: f.detail });
  for (const f of report.partial) if (f.tradeId) actions.push({ tradeId: f.tradeId, action: 'return-prints', reason: f.detail });
  const manual = [...report.openDeletedSeason, ...report.restoreDuplicates, ...report.unconfirmed, ...report.unnumbered, ...report.seasonMissing];
  for (const f of manual) actions.push({ tradeId: f.tradeId ?? '-', action: 'manual', reason: f.detail });
  return actions;
}

export function countFindings(report: AuditReport): number {
  return report.refunded.length + report.openDeletedSeason.length + report.restoreDuplicates.length;
}

const line = (f: LedgerFinding) => `  - ${f.tradeId ?? f.username ?? '?'} ${f.seasonName ? `(${f.seasonName}) ` : ''}${f.detail}`;

/** Human report. The first three sections are the ones that mean a record was already affected. */
export function formatReport(report: AuditReport, host: string): string {
  const section = (title: string, rows: LedgerFinding[]) => [`${title}: ${rows.length}`, ...rows.map(line)].join('\n');
  return [
    `trade ledger audit (read-only)`,
    `store: ${host}`,
    'No keys were written. Finished offers outside the kept 400 are not in this report.',
    '',
    section('already refunded, still marked escrowed', report.refunded),
    section('open offers for a deleted season', report.openDeletedSeason),
    section('possible restore duplicates', report.restoreDuplicates),
    '',
    'The rows below are not counted as already-affected. They need a person.',
    section('still in escrow (flag matches the editions)', report.stillHeld),
    section('partial escrow', report.partial),
    section('escrow empty, refund not confirmed', report.unconfirmed),
    section('unnumbered, cannot tell', report.unnumbered),
    section('closed offer, season missing', report.seasonMissing),
    '',
    countFindings(report) === 0 ? 'None of the three checks matched.' : `${countFindings(report)} row${countFindings(report) === 1 ? '' : 's'} matched the three checks.`,
  ].join('\n');
}

export interface KvReader {
  get<T = unknown>(key: string): Promise<T | null>;
  hgetall(key: string): Promise<Record<string, unknown> | null>;
}

function hashCopies(raw: Record<string, unknown> | null): AuditCopy[] {
  if (!raw) return [];
  return Object.values(raw).map(parseAuditCopy).filter((c): c is AuditCopy => !!c);
}

/** Loads the rows the classifier needs. The caller must pass a reader with no write methods. */
export async function loadAuditInput(db: KvReader): Promise<AuditInput> {
  const ids = (await db.get<string[]>('seasons:list')) ?? [];
  const seasons: AuditSeason[] = [];
  for (const id of ids) {
    const s = await db.get<{ id: string; name?: string; collectionName?: string }>(`season:${id}`);
    if (!s?.collectionName) continue;
    const tracking = !!(await db.get(`copies:${s.collectionName}:init`));
    seasons.push({ id: s.id, name: s.name || s.id, collectionName: s.collectionName, tracking });
  }
  const open = (await db.get<Trade[]>('trades:open')) ?? [];
  const history = (await db.get<Trade[]>('trades:history')) ?? [];
  const collections: AuditInput['collections'] = {};
  const copies: AuditInput['copies'] = {};
  const retired: AuditInput['retired'] = {};

  for (const season of seasons) {
    // Read only (the reader has no write methods, so no move to the hash layout from here): the hash, or the old string of a season not moved yet.
    const data = ((await db.hgetall(`coll:${season.collectionName}`)) as Record<string, number[]> | null)
      ?? (await db.get<Record<string, number[]>>(`tcg_${season.collectionName}`)) ?? {};
    collections[season.collectionName] = data;
    copies[season.collectionName] = {};
    if (!season.tracking) continue;
    retired[season.collectionName] = hashCopies(await db.hgetall(`copies:${season.collectionName}:ret`));
    const owners = new Set<string>(Object.keys(data));
    for (const t of [...open, ...history]) {
      if (t.seasonId === season.id && t.escrowed) owners.add(escrowOwner(t.id));
    }
    const list = [...owners];
    for (let i = 0; i < list.length; i += 20) {
      const slice = list.slice(i, i + 20);
      const batches = await Promise.all(slice.map(async owner => [owner, hashCopies(await db.hgetall(`copies:${season.collectionName}:o:${owner}`))] as const));
      for (const [owner, rows] of batches) copies[season.collectionName][owner] = rows;
    }
  }
  return { seasons, open, history, collections, copies, retired };
}
