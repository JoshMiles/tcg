// TCG Bridge's pre-stream checklist (ROADMAP 57.1), the KV side: what the site knows for the app's checklist, and the last report the app made.
import { kv } from './db';
import { cleanChecklist, readChecklistValue, type ChecklistResult } from './bridge-checklist-core';
import { getHappyHour, happyHourWhat } from './happyhour';
import { getActiveSeasonWithPacks } from './kv';
import { isPullsPaused } from './pull-pause';
import { queueLength } from './webhooks';

const KEY = 'bridge:checklist';

export interface ChecklistFacts { season: { name: string } | null; openablePacks: number; queueLength: number; paused: boolean; happyHour: { what: string; endsAt: number } | null }

/** The four facts about the site that the checklist shows. Read only; nothing is changed. */
export async function checklistFacts(): Promise<ChecklistFacts> {
  const [active, queued, paused, hh] = await Promise.all([getActiveSeasonWithPacks().catch(() => null), queueLength().catch(() => 0), isPullsPaused(), getHappyHour()]);
  return {
    season: active ? { name: active.season.name } : null,
    openablePacks: active ? active.packs.filter(p => p.cards.length > 0).length : 0,
    queueLength: queued,
    paused,
    happyHour: hh ? { what: happyHourWhat(hh), endsAt: hh.endsAt } : null,
  };
}

/** Keeps the app's report with the time it arrived. False when the shape is wrong. */
export async function storeChecklist(raw: unknown): Promise<boolean> {
  const r = cleanChecklist(raw, Date.now());
  if (!r) return false;
  await kv.set(KEY, r);
  return true;
}

export async function readChecklist(): Promise<ChecklistResult | null> {
  return readChecklistValue(await kv.get(KEY).catch(() => null));
}
