// The Stream Deck webhook (ROADMAP 55.2): a Mix It Up button applies a buff or a quick action. POST /api/webhooks/buff calls runStreamDeck,
// which answers { ok, message } with a line Mix It Up can post to chat. A buff answers only when its Stream Deck switch is on (Buff Editor).
import { kv } from './db';
import { cleanLogin } from './staff-core';
import { getActiveSeason } from './kv';
import { getActivity } from './activity';
import { recordAudit } from './audit';
import { applyBuff, currentBuffStreamKey, getBuffDef, type ApplyBuffOutcome } from './buffs';
import { POINTS_DEFAULT, type BuffDef } from './buffs-core';
import { currentStreamKey } from './mixitup';
import { queuePull } from './pull-queue';
import { setStreamPullBuff } from './pull-limit';
import { streamAmount } from './pull-limit-core';
import { endHappyHour, startHappyHour } from './happyhour';

const COOLDOWN_S = 10;
const BY = 'Stream Deck';
export const LAST_BUFF = 'streamdeck:last';

export interface StreamDeckResult { ok: boolean; message: string }
const no = (message: string): StreamDeckResult => ({ ok: false, message });

/** The newest viewer to pull since this stream began, or null when no one has. */
async function lastPuller(): Promise<string | null> {
  const key = await currentStreamKey();
  const since = key.startsWith('s') ? Number(key.slice(1)) : Date.parse(key.slice(1));
  const { events } = await getActivity({ limit: 200 });
  return events.find(e => e.type === 'pull' && e.at >= since)?.username ?? null;
}

const NEEDS_VIEWER = 'This one needs a viewer: use target viewer or last-pull.';

/** 'everyone', or a viewer's login. A refusal in words when the target does not fit. */
async function resolveTarget(body: Record<string, unknown>, needsViewer: boolean): Promise<{ who: string } | StreamDeckResult> {
  const target = typeof body.target === 'string' && body.target ? body.target : needsViewer ? '' : 'everyone';
  if (target === 'everyone') return needsViewer ? no(NEEDS_VIEWER) : { who: 'everyone' };
  if (target === 'last-pull') {
    const u = await lastPuller();
    return u ? { who: u } : no('No one has pulled this stream yet.');
  }
  if (target === 'viewer') {
    const u = cleanLogin(body.username);
    return u ? { who: u } : no('Say which viewer: add their name.');
  }
  return no(needsViewer ? NEEDS_VIEWER : 'target must be everyone, viewer or last-pull.');
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** "+1 pull this stream", "+100 Brie Bucks": what a buff gives, for the chat line. */
export function phrase(def: BuffDef): string {
  const n = (def.points ?? POINTS_DEFAULT).toLocaleString('en-US');
  if (def.type === 'score-bonus') return `+${n} leaderboard points`;
  if (def.type === 'currency-grant') return `+${n} Brie Bucks`;
  const what = def.type === 'extra-pulls' ? `+${plural(def.magnitude, 'pull')}` : def.type === 'extra-pack' ? plural(def.magnitude, 'free pack') : 'rarer pulls';
  const d = def.duration;
  const dur = d.unit === 'season' ? ' this season' : d.unit === 'hours' ? ` for ${d.n ?? 1}h` : d.unit === 'streams' ? ((d.n ?? 1) === 1 ? ' this stream' : ` for ${plural(d.n ?? 1, 'stream')}`) : ` for ${plural(d.n ?? 1, 'pull')}`;
  return what + dur;
}

export function refusal(r: Extract<ApplyBuffOutcome, { ok: false }>, def: BuffDef, who: string): string {
  switch (r.reason) {
    case 'already_active': return `${def.name} is already active${who === 'everyone' ? '' : ` for ${who}`}.`;
    case 'max_buffs': return `${who} has too many buffs already.`;
    case 'mixitup_off': return 'Mix It Up is off or is missing an address this buff needs.';
    case 'mixitup_failed': return 'Mix It Up did not answer, so nothing was applied.';
    case 'no_season': return 'There is no active season.';
    default: return `${def.name} could not be applied.`;
  }
}

/** Takes the cooldown for this button press (one atomic write). False = it was pressed in the last COOLDOWN_S seconds. */
async function takeCooldown(...parts: string[]): Promise<boolean> {
  return !!(await kv.set(`streamdeck:cd:${parts.join(':')}`, 1, { nx: true, ex: COOLDOWN_S }));
}

const COOLING = 'That button was just pressed. Wait a few seconds.';

/** Runs one Stream Deck press: { buff, target?, username? } or { action, amount?, target?, username? }. The route has checked the secret. */
export async function runStreamDeck(body: Record<string, unknown>): Promise<StreamDeckResult> {
  if (typeof body.action === 'string') return runAction(body);

  const def = typeof body.buff === 'string' ? await getBuffDef(body.buff) : null;
  if (!def?.streamDeck || def.type === 'grant-achievement') return no(''); // an unknown buff or one that is not switched on answers nothing

  const community = def.scope === 'community';
  const t = await resolveTarget(body, !community);
  if ('ok' in t) return t;
  if (community && t.who !== 'everyone') return no(`${def.name} goes to everyone, not one viewer.`);
  if (!(await takeCooldown('buff', def.id, t.who))) return no(COOLING);

  const [season, stream] = await Promise.all([getActiveSeason().catch(() => null), currentBuffStreamKey().catch(() => undefined)]);
  const r = await applyBuff(community ? BY : t.who, def.id, { source: 'streamdeck', seasonId: season?.id, streamKey: stream });
  if (!r.ok) return no(refusal(r, def, t.who));
  await kv.set(LAST_BUFF, { buff: def.id, target: body.target, username: body.username }); // "the last buff again" (lib/bridge-actions.ts)
  await recordAudit(t.who, `${BY}: ${t.who} ${phrase(def)}`, def.name);
  const unpaid = r.partial ? ` ${r.partial.unpaid} of ${r.partial.total} are unpaid; staff can retry them.` : '';
  return { ok: true, message: `${t.who === 'everyone' ? 'Everyone gets' : `${t.who} gets`} ${phrase(def)}.${unpaid}` };
}

async function runAction(body: Record<string, unknown>): Promise<StreamDeckResult> {
  if (body.action === 'stream-pulls') {
    if (!(await takeCooldown('stream-pulls'))) return no(COOLING);
    const n = streamAmount(body.amount);
    if (n === null) return no('amount must be a whole number, 0 or more.');
    await setStreamPullBuff(n, await currentStreamKey(), BY);
    await recordAudit('everyone', `${BY}: ${n === 0 ? 'stream pull bonus cleared' : `everyone +${n} pulls this stream`}`);
    return { ok: true, message: n === 0 ? 'The extra pulls for this stream are cleared.' : `Everyone gets ${plural(n, 'extra pull')} this stream.` };
  }
  if (body.action === 'happy-hour') {
    if (!(await takeCooldown('happy-hour'))) return no(COOLING);
    const n = streamAmount(body.amount);
    if (n === null) return no('amount must be the minutes: a whole number, 0 ends it.');
    if (n === 0) return { ok: true, message: (await endHappyHour(BY)).message };
    const hasPercent = body.percent !== undefined && body.percent !== null && body.percent !== '';
    const r = await startHappyHour({ minutes: n, kind: hasPercent ? 'discount' : 'free', percent: body.percent }, BY);
    return { ok: r.ok, message: r.message };
  }
  if (body.action === 'free-pack') {
    const t = await resolveTarget(body, true);
    if ('ok' in t) return t;
    if (!(await takeCooldown('free-pack', t.who))) return no(COOLING);
    const r = await queuePull(t.who, { free: true });
    if (r.ignored) return no(String(r.message ?? 'The pack could not be queued.'));
    await recordAudit(t.who, `${BY}: free pack`, `A pack that never charges, queued for ${t.who}`);
    return { ok: true, message: `Opening a free pack for ${t.who}.` };
  }
  return no('');
}
