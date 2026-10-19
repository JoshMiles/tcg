import { Icon } from '@/app/components/Icon';
import Link from 'next/link';
import { cardThumbUrl } from '@/lib/card-art';
import { VARIANTS, VARIANT_LABELS } from '@/lib/variants';
import type { Season } from '@/lib/types';
import type { SeasonCard, SeasonOverview } from '@/lib/site-data';
import type { Bonuses, CardValue } from '@/lib/leaderboard';
import type { ScoringSettings } from '@/lib/scoring';
import { Section, Q } from '../parts';

const VARIANT_SHORT: Record<string, string> = { reverse: 'RH', full: 'FA', shiny: 'SH' };

export type ValueRow = { card: SeasonCard; v: CardValue | undefined; upgradable: boolean };

export function PointsSection({ season, overview, upgradesOn, bonusAtFull, scoring, valueRows }: { season: Season | null; overview: SeasonOverview | null; upgradesOn: boolean; bonusAtFull: Bonuses | null; scoring: ScoringSettings; valueRows: ValueRow[] }) {
  return (
    <Section id="points" title="Points & leaderboard" icon="trophy">
      <Q q="How are points worked out?" open>
        <p>
          Your score is the value of <strong className="text-white">every card you own</strong>, duplicates included. Each edition is worth:
        </p>
        <p className="font-display text-xl font-bold text-yellow-300 my-2">{scoring.baseScore} × rarity{upgradesOn ? ' × version' : ''} × print bonus</p>
        <ul className="space-y-2">
          <li>
            <strong className="text-white">Rarity</strong>: how hard the card is to pull compared with an average card. A card that comes up half as often is worth twice as much.
          </li>
          <li>
            <strong className="text-white">Print bonus</strong>: {scoring.serialBonusCutoff > 0 ? (
              <>every edition has a <a href="#serials" className="text-yellow-400 hover:text-yellow-300">print number</a>, and the first editions ever made of a card (in each version) are worth extra. Print #1 is worth{' '}
              <strong className="text-white">{scoring.serialBonusMax}×</strong>, and the bonus fades in a straight line until it is gone after #{scoring.serialBonusCutoff}. The bonus belongs to the edition, so it moves with it if you trade it.</>
            ) : 'switched off in this game, so every edition of a version is worth the same.'}
          </li>
          {upgradesOn && (
            <li>
              <strong className="text-white">Version</strong>: Reverse Holo, Full Art and Shiny Full Art editions are worth far more than a Regular. An upgraded card is normally worth more than the editions you spend to
              make it, though the print bonus on the editions you spend can change that.
            </li>
          )}
        </ul>
        <p className="mt-2">
          Add up all your editions, then add the <a href="#bonuses" className="text-yellow-400 hover:text-yellow-300">collection bonuses</a> below, and that&rsquo;s your score on the{' '}
          <Link href="/leaderboard" className="text-yellow-400 hover:text-yellow-300">leaderboard</Link>.
        </p>
      </Q>
      <Q q="What are the collection bonuses?">
        <p id="bonuses">
          Collecting more of the set pays off, on top of what your individual cards are worth. There are two bonuses, both measured against the <strong className="text-white">set value</strong>: what one
          Regular edition of every card in the season is worth right now{overview ? <> (currently <strong className="text-white">{overview.values.setValue.toLocaleString()}</strong> points)</> : null}:
        </p>
        <ul className="list-disc pl-5 space-y-1 marker:text-gray-600 mt-2">
          <li>
            <strong className="text-white">Progress bonus</strong> (it used to be called the completion bonus): grows with the share of the set you own, up to{' '}
            <strong className="text-white">{scoring.completionBonusPct}%</strong> of the set value
            {bonusAtFull ? <> (about <strong className="text-white">{bonusAtFull.completion.toLocaleString()}</strong> points at 100%)</> : null}. Every new card you find adds its own points <em>and</em> raises this.
          </li>
          <li>
            <strong className="text-white">Full set bonus</strong> (it used to be called the complete collection bonus): own at least one of <em>every</em> card in the season and you earn an extra{' '}
            <strong className="text-white">{scoring.completeSetBonusPct}%</strong> of the set value
            {bonusAtFull ? <> (about <strong className="text-white">{bonusAtFull.set.toLocaleString()}</strong> points)</> : null}, and a <strong className="text-white"><Icon name="cheese" className="mr-1" />Complete</strong> badge on the leaderboard.
          </li>
        </ul>
        <p className="mt-2">
          Duplicates and rarer versions don&rsquo;t count towards completeness. Only having at least one edition of each card does. The bonuses move with the set value, so they stay in proportion as card values shift. You can see your own
          breakdown on <Link href="/account" className="text-yellow-400 hover:text-yellow-300">My stats</Link>.
        </p>
      </Q>
      <Q q="Can I see the exact maths for a card?">
        <p>
          Yes. Click any card on the <Link href="/cards" className="text-yellow-400 hover:text-yellow-300">card dex</Link> or in a collection to open its details, then open{' '}
          <strong className="text-white"><Icon name="nerd" className="mr-1" />Advanced information (for nerds)</strong>. It shows every step with the real numbers filled in, for each version: the pull chance, rarity, the version multiplier
          and the final rounding, plus the pull odds, how many packs you&rsquo;d expect to need, and what the print bonus is worth at different numbers. In short:
        </p>
        <p className="font-mono text-[12px] text-gray-300 my-2 leading-relaxed">
          points = max(1, round( {scoring.baseScore} × rarity × version × print bonus ))<br />
          rarity = (1 ÷ (pull chance × cards in the season)) ^ {scoring.rarityExponent}<br />
          print bonus = 1 + ({scoring.serialBonusMax} − 1) × (1 − (print − 1) ÷ {scoring.serialBonusCutoff}) for print 1 to {scoring.serialBonusCutoff}, otherwise 1<br />
          version = max( Regular weight ÷ version weight, previous version × upgrade cost × {scoring.upgradeMargin} )
        </p>
        <p>
          The {scoring.baseScore}, the limits and the margin are settings the streamer can change, so the numbers above are today&rsquo;s. Cards sitting in an open trade (escrow) aren&rsquo;t counted as editions in anyone&rsquo;s collection.
        </p>
      </Q>
      <Q q="Why did my points change?">
        An edition’s own points only change if the streamer edits the scoring settings or the card’s pull odds change. What moves most is your rank, because other collectors keep pulling and the completion bonus is measured against the set value. A print bonus never changes: it is fixed by the print number on the edition.
      </Q>
      <Q q="Does upgrading raise my score?">
        {upgradesOn ? (
          <>
            Usually, yes. A higher version is worth much more. But upgrades <strong className="text-white">use cards up</strong>: the editions you spend are destroyed (the newest print numbers go first, so your lowest numbers are the last to go), and the new edition gets the next free print of its version, which is only worth a bonus while it is still early in that version’s count. <Link href="/account" className="text-yellow-400 hover:text-yellow-300">My stats</Link>{' '}
            shows a projected change for each upgrade with all of this included, so occasionally it can be negative.
          </>
        ) : (
          <>Upgrades only exist in seasons with variants. When they do, My stats shows the projected points change for each upgrade before you commit.</>
        )}
      </Q>
      <Q q="Is there a leaderboard for each season?">
        Yes. Every season has its own leaderboard, and past seasons stay available. When a season ends, its leaderboard shows the final standings saved at that moment, with the season&rsquo;s awards. Use the season buttons at the top of the <Link href="/leaderboard" className="text-yellow-400 hover:text-yellow-300">leaderboard</Link>,{' '}
        <Link href="/stats" className="text-yellow-400 hover:text-yellow-300">stats</Link> and <Link href="/cards" className="text-yellow-400 hover:text-yellow-300">card dex</Link> pages.
      </Q>
      {valueRows.length > 0 && (
        <Q q={`What is each card worth right now? (${season?.name})`}>
          <p className="mb-3">Points per edition at this moment. These update as cards are pulled and upgraded.</p>
          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 text-left bg-gray-950/50">
                  <th className="py-2 px-3 font-medium">Card</th>
                  <th className="py-2 px-2 font-medium text-right">Editions</th>
                  <th className="py-2 px-2 font-medium text-right">Regular</th>
                  {upgradesOn && VARIANTS.filter(v => v !== 'regular').map(v => (
                    <th key={v} className="py-2 px-2 font-medium text-right" title={VARIANT_LABELS[v]}>{VARIANT_SHORT[v]}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {valueRows.map(({ card, v, upgradable }) => (
                  <tr key={card.id} className="text-gray-300">
                    <td className="py-1.5 px-3">
                      <span className="flex items-center gap-2">
                        {card.imageUrl && <img src={cardThumbUrl(card.imageUrl)} alt="" loading="lazy" className="w-5 h-7 object-cover rounded-xs" />}
                        <span className="truncate">{card.name}</span>
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-gray-500">{v!.copies}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{v!.values.regular}</td>
                    {upgradesOn && VARIANTS.filter(x => x !== 'regular').map(x => (
                      <td key={x} className="py-1.5 px-2 text-right tabular-nums text-gray-400">{upgradable ? v!.values[x] : '-'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {upgradesOn && <p className="text-[11px] text-gray-600 mt-2">RH = Reverse Holo · FA = Full Art · SH = Shiny Full Art.</p>}
        </Q>
      )}
    </Section>
  );
}
