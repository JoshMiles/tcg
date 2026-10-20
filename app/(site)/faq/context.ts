import { getActive, getSeasonOverview } from '@/lib/site-data';
import { collectionBonuses } from '@/lib/leaderboard';
import { DEFAULT_SCORING } from '@/lib/scoring';
import { DEFAULT_UPGRADE_COSTS, DEFAULT_VARIANT_WEIGHTS, VARIANTS, effectiveWeights } from '@/lib/variants';
import { getTradeSettings } from '@/lib/trades';
import { getCommands } from '@/lib/commands';
import { FEEDBACK_LIMITS } from '@/lib/feedback-core';
import { CONTACT_EMAIL, OPERATOR } from '@/lib/legal';
import { CHANNEL_NAME, CHANNEL_URL, featureRequestUrl, reportProblemUrl } from '@/lib/site';
import { SHOWOFF_COOLDOWN_S } from '@/lib/showoff-prepare';
import type { FaqWhen } from '@/lib/faq-builtins';
import type { FaqValues } from '@/lib/faq-core';
import type { FaqBlockData, ValueRow } from './blocks';

export interface FaqContext {
  /** What each {placeholder} is worth right now. Every key is always present (an empty string when there is nothing to say). */
  values: FaqValues;
  /** Which `when` conditions hold for the current season. */
  flags: Record<FaqWhen, boolean>;
  blockData: FaqBlockData;
}

/** The live numbers the FAQ quotes, read once for the public page and the editor's placeholder list. */
export async function getFaqContext(): Promise<FaqContext> {
  const [activeData, trade, allCommands] = await Promise.all([getActive(), getTradeSettings(), getCommands()]);
  const { season } = activeData;
  const overview = season ? await getSeasonOverview(season) : null;

  // Live numbers from the current season where we have them; sensible defaults otherwise.
  const upgradePack = overview?.cards.find(c => c.pack.upgradesEnabled)?.pack ?? null;
  const costs = upgradePack?.upgradeCosts ?? DEFAULT_UPGRADE_COSTS;
  const weights = upgradePack ? effectiveWeights(upgradePack) : DEFAULT_VARIANT_WEIGHTS;
  const wTotal = VARIANTS.reduce((s, v) => s + Math.max(0, weights[v]), 0) || 1;
  const pct = (v: (typeof VARIANTS)[number]) => {
    const p = (Math.max(0, weights[v]) / wTotal) * 100;
    return p >= 10 ? p.toFixed(0) : p.toFixed(1);
  };
  const upgradesOn = !!upgradePack;

  const bonusAtFull = overview ? collectionBonuses(overview.values, overview.values.totalCards) : null;
  const scoring = overview?.values.settings ?? DEFAULT_SCORING;

  const valueRows: ValueRow[] = overview
    ? overview.cards
        .map(c => ({ card: c, v: overview.values.cards.get(c.number), upgradable: c.pack.upgradesEnabled && c.upgradesEnabled !== false }))
        .filter(x => x.v)
        .sort((a, b) => b.v!.values.regular - a.v!.values.regular)
    : [];

  const n = (x: number) => x.toLocaleString();
  const values: FaqValues = {
    channel: CHANNEL_NAME,
    channel_url: CHANNEL_URL,
    season: season?.name ?? 'the current season',
    pct_regular: pct('regular'),
    pct_reverse: pct('reverse'),
    pct_full: pct('full'),
    pct_shiny: pct('shiny'),
    pct_golden: pct('golden'),
    golden_clause: Number(pct('golden')) > 0 ? `, and **${pct('golden')}%** Golden` : '',
    cost_reverse: String(costs.reverse),
    cost_full: String(costs.full),
    cost_shiny: String(costs.shiny),
    cost_golden: String(costs.golden),
    regulars_for_full: String(costs.reverse * costs.full),
    regulars_for_shiny: String(costs.reverse * costs.full * costs.shiny),
    trade_expiry_hours: String(trade.expiryHours),
    trade_max_open: String(trade.maxOpenPerUser),
    trade_cooldown_seconds: String(trade.cooldownSeconds),
    trade_max_stacks: String(trade.maxStacksPerSide),
    base_score: String(scoring.baseScore),
    print_max: String(scoring.serialBonusMax),
    print_cutoff: String(scoring.serialBonusCutoff),
    rarity_exponent: String(scoring.rarityExponent),
    upgrade_margin: String(scoring.upgradeMargin),
    score_formula: `${scoring.baseScore} × rarity${upgradesOn ? ' × version' : ''} × edition bonus`,
    version_point: upgradesOn
      ? '- **Version**: Reverse Holo, Full Art, Full Art Holo and Golden editions are worth far more than a Regular. An upgraded card is normally worth more than the editions you spend to make it, though the edition bonus on the editions you spend can change that.'
      : '',
    print_bonus_text: scoring.serialBonusCutoff > 0
      ? `every edition has an [edition number](#serials), and the first editions ever made of a card (in each version) are worth extra. Edition #1 is worth **${scoring.serialBonusMax}×** and the bonus decreases until the ${scoring.serialBonusCutoff}th edition of that card is created. The bonus belongs to the edition, so it moves with it if you trade it.`
      : 'switched off in this game, so every edition of a version is worth the same.',
    set_value_clause: overview ? ` (currently **${n(overview.values.setValue)}** points)` : '',
    completion_bonus_pct: String(scoring.completionBonusPct),
    completion_at_full_clause: bonusAtFull ? ` (about **${n(bonusAtFull.completion)}** points at 100%)` : '',
    set_bonus_pct: String(scoring.completeSetBonusPct),
    set_at_full_clause: bonusAtFull ? ` (about **${n(bonusAtFull.set)}** points)` : '',
    showoff_cooldown: String(SHOWOFF_COOLDOWN_S),
    feedback_per_day: String(FEEDBACK_LIMITS.perDay),
    feedback_keep_days: String(FEEDBACK_LIMITS.keepDaysAfterResolved),
    reports_per_day: String(FEEDBACK_LIMITS.reportsPerDay),
    feature_request_url: featureRequestUrl(),
    report_problem_url: reportProblemUrl(),
    contact: CONTACT_EMAIL ? `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})` : `contact ${OPERATOR} through the stream’s Twitch channel`,
  };

  return {
    values,
    flags: { upgrades: upgradesOn, no_upgrades: !upgradesOn, values: valueRows.length > 0 },
    blockData: { chatCommands: allCommands.filter(c => c.enabled), upgradesOn, scoring, valueRows },
  };
}
