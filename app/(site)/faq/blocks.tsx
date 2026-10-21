import type { ReactNode } from 'react';
import { cardThumbUrl } from '@/lib/card-art';
import { FAQ_LINES } from '@/lib/commands-core';
import type { ChatCommand } from '@/lib/commands-core';
import type { ScoringSettings } from '@/lib/scoring';
import type { SeasonCard } from '@/lib/site-data';
import type { CardValue } from '@/lib/leaderboard';
import { RARITIES } from '@/lib/rarity';
import { VARIANTS, VARIANT_LABELS } from '@/lib/variants';
import type { FaqBlockName } from '@/lib/faq-core';

// Live blocks: what an answer's text cannot hold. An answer shows one on a line of its own as {{name}}; FAQ_BLOCK_NAMES in lib/faq-core.ts lists the names.

const VARIANT_SHORT: Record<string, string> = { reverse: 'RH', full: 'FA', shiny: 'FH', golden: 'GD' };

export type ValueRow = { card: SeasonCard; v: CardValue | undefined; upgradable: boolean };

export interface FaqBlockData {
  chatCommands: ChatCommand[];
  upgradesOn: boolean;
  scoring: ScoringSettings;
  valueRows: ValueRow[];
}

function ChatCommands({ chatCommands }: FaqBlockData) {
  return (
    <ul className="list-disc pl-5 space-y-1 marker:text-gray-600">
      {chatCommands.map(c => (
        <li key={c.id}><strong className="text-white">!{c.name}</strong>{c.aliases.length > 0 && <> (or {c.aliases.map(a => `!${a}`).join(', ')})</>} {FAQ_LINES[c.action]}</li>
      ))}
      <li><strong className="text-white">!pack</strong> asks the stream to open a pack for you. It is set up in Mix It Up, not in the command builder.</li>
    </ul>
  );
}

function Rarities() {
  return (
    <p>
      {[...RARITIES].reverse().map((r, i, arr) => (
        <span key={r.stars}><strong style={{ color: r.hex }}>{'★'.repeat(r.stars)} {r.label}</strong>{i < arr.length - 1 ? ', ' : '.'} </span>
      ))}
    </p>
  );
}

function PointsFormula({ scoring }: FaqBlockData) {
  return (
    <p className="font-mono text-[12px] text-gray-300 leading-relaxed">
      points = max(1, round({scoring.baseScore} × rarity × version × edition bonus))<br />
      rarity = (1 ÷ (pull chance × cards in the season)) ^ {scoring.rarityExponent}<br />
      edition bonus = 1 + ({scoring.serialBonusMax} − 1) × (1 − (edition − 1) ÷ {scoring.serialBonusCutoff}) for edition 1 to {scoring.serialBonusCutoff}, otherwise 1<br />
      version = max(Regular weight ÷ version weight, previous version × upgrade cost × {scoring.upgradeMargin})
    </p>
  );
}

function CardValues({ valueRows, upgradesOn }: FaqBlockData) {
  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 text-left bg-gray-950/50">
              <th className="py-2 px-3 font-medium">Card</th>
              <th className="py-2 px-2 font-medium text-right">Pulls</th>
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
      {upgradesOn && <p className="text-[11px] text-gray-600 mt-2">RH = Reverse Holo · FA = Full Art · FH = Full Art Holo · GD = Golden.</p>}
    </>
  );
}

const BLOCKS: Record<FaqBlockName, (data: FaqBlockData) => ReactNode> = {
  chat_commands: d => <ChatCommands {...d} />,
  rarities: () => <Rarities />,
  points_formula: d => <PointsFormula {...d} />,
  card_values: d => <CardValues {...d} />,
};

/** Renders a named block; an unknown name renders nothing (the editor warns about it). */
export function FaqBlock({ name, data }: { name: string; data: FaqBlockData }) {
  const render = (BLOCKS as Record<string, ((data: FaqBlockData) => ReactNode) | undefined>)[name];
  return render ? <>{render(data)}</> : null;
}
