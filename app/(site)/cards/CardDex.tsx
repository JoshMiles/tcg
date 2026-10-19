'use client';
import { Icon, RankMedal } from '@/app/components/Icon';
import { InfoTip } from '@/app/components/InfoTip';
import type { TermId } from '@/lib/glossary';
import Link from 'next/link';
import { holoClass, holoVars, type HoloSpecs } from '@/lib/holo-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CardTile } from '@/app/components/CardTile';
import { Avatar } from '@/app/components/Avatar';
import { RARITIES, getRarity } from '@/lib/rarity';
import { cardThumbUrl, stillFor } from '@/lib/card-art';
import { VARIANTS, VARIANT_LABELS, type VariantCounts } from '@/lib/variants';
import type { Variant } from '@/lib/types';
import { CardMathsPanel } from '@/app/components/CardMathsPanel';
import type { CardMaths } from '@/lib/card-maths';
import { DEFAULT_DEX, SORT_LABELS, applyDex, dexProgress, type DexFilter, type DexShow, type DexSort } from '@/lib/dex-view';
import { ShareImageButton } from '@/app/components/ShareImage';
import { toggleWantedAction } from './actions';

export interface DexOwner {
  username: string;
  copies: number;
  variants: VariantCounts;
  points: number;
  avatar?: string;
}

export interface DexCard {
  id: string;
  number: number;
  name: string;
  imageUrl: string;
  fullArtImageUrl?: string;
  stillUrl?: string;
  fullArtStillUrl?: string;
  stars: number;
  packName: string;
  pullRate: number;
  copies: number;
  upgradable: boolean;
  /** Points per copy: Regular, Reverse Holo, Full Art, Shiny Full Art. */
  values: [number, number, number, number];
  /** Copies of each version out there, and the chance of each per pull. */
  variantCopies: VariantCounts;
  variantOdds: Record<Variant, number>;
  /** Biggest collectors of this card (most copies first) and how many collectors own it at all. */
  owners: DexOwner[];
  collectors: number;
  /** Whether the logged-in viewer owns it; undefined when nobody is logged in. */
  owned?: boolean;
  /** Whether it is on the logged-in viewer's Looking for list. */
  wanted?: boolean;
  /** The holographic shimmer per variant, from the Overlay Editor's settings for this card's pack. */
  holo: HoloSpecs;
  /** The working behind this card's points, for the Advanced information panel. */
  maths?: CardMaths;
}

const SHORT: Record<Variant, string> = { regular: '', reverse: 'RH', full: 'FA', shiny: 'SH' };
const VARIANT_TIPS: Partial<Record<Variant, TermId>> = { reverse: 'reverseHolo', full: 'fullArt', shiny: 'shiny' };
const oneIn = (p: number) => (p > 0 ? `1 in ${Math.round(1 / p).toLocaleString()}` : '-');
const artFor = (c: DexCard, v: Variant) => ((v === 'full' || v === 'shiny') && c.fullArtImageUrl ? c.fullArtImageUrl : c.imageUrl);
const maskFor = (c: DexCard, url: string) => (cardThumbUrl(url) !== url ? `url("${stillFor(c, url)}")` : 'none');

/** Every card in a season, with filters (rarity, pack, collected / missing / wanted / undiscovered), sorting, search and click-through details. */
export function CardDex({ cards, seasonId, siteHost, signedIn = false, compactDefault = false, showMine = false, initialOpenId }: { cards: DexCard[]; seasonId: string; siteHost: string; signedIn?: boolean; compactDefault?: boolean; showMine?: boolean; initialOpenId?: string }) {
  const [f, setF] = useState<DexFilter>(DEFAULT_DEX);
  const patch = (p: Partial<DexFilter>) => setF(x => ({ ...x, ...p }));
  const [compact, setCompact] = useState(compactDefault);
  const [wantedMap, setWantedMap] = useState<Record<number, boolean>>({});
  const [wantedError, setWantedError] = useState('');
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null); // /cards?card=7 (from search) opens that card
  const opener = useRef<HTMLElement | null>(null);

  const rows = useMemo(() => cards.map(c => ({ ...c, value: c.values[0], wanted: wantedMap[c.number] ?? c.wanted })), [cards, wantedMap]);
  const shown = useMemo(() => applyDex(rows, f), [rows, f]);

  const tiers = RARITIES.filter(r => cards.some(c => c.stars === r.stars));
  const packs = [...new Set(cards.map(c => c.packName))];
  const progress = dexProgress(rows);
  const wantedCount = rows.filter(c => c.wanted).length;
  const filtering = f.q !== '' || f.stars !== null || f.pack !== '' || f.show !== 'all' || f.sort !== 'number' || f.dir !== 1;

  async function toggleWanted(c: DexCard) {
    const now = !(wantedMap[c.number] ?? c.wanted);
    setWantedMap(m => ({ ...m, [c.number]: now })); // optimistic
    setWantedError('');
    const res = await toggleWantedAction(c.number);
    if (!res.ok) { setWantedMap(m => ({ ...m, [c.number]: !now })); setWantedError(res.error); }
  }

  const openIdx = openId ? shown.findIndex(c => c.id === openId) : -1;
  const close = useCallback(() => {
    setOpenId(null);
    opener.current?.focus();
    // Opened from a link (/cards?card=7)? Drop the parameter, so a refresh or Back does not reopen the dialog.
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has('card')) { u.searchParams.delete('card'); window.history.replaceState(null, '', u.pathname + u.search + u.hash); }
    } catch { /* leave the address as it is */ }
  }, []);
  const step = useCallback((d: number) => {
    setOpenId(cur => {
      if (!cur || shown.length === 0) return cur;
      const i = shown.findIndex(c => c.id === cur);
      return shown[(i + d + shown.length) % shown.length].id;
    });
  }, [shown]);

  const select = 'select select-sm w-fit max-w-full';
  return (
    <div className="space-y-5">
      {showMine && (
        <div className="rind rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Your progress">
          <p className="text-sm text-gray-300"><strong className="text-white tabular-nums">{progress.owned}</strong> of <span className="tabular-nums">{progress.total}</span> collected</p>
          <div className="h-2 w-48 max-w-full rounded-full bg-gray-950 border border-gray-800 overflow-hidden" role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-linear-to-r from-yellow-300 to-yellow-600" style={{ width: `${progress.pct}%` }} /></div>
          {wantedCount > 0 && <p className="text-xs text-gray-500">{wantedCount} on your <Link href="/settings#looking-for" className="text-yellow-400 hover:text-yellow-300">Looking for</Link> list</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={f.q}
          onChange={e => patch({ q: e.target.value })}
          placeholder="Search name or #"
          aria-label="Search cards"
          className="input input-sm w-56 max-w-full"
        />
        <div className="flex flex-wrap gap-1.5">
          <Chip active={f.stars === null} onClick={() => patch({ stars: null })}>All</Chip>
          {tiers.map(r => (
            <Chip key={r.stars} active={f.stars === r.stars} onClick={() => patch({ stars: f.stars === r.stars ? null : r.stars })} color={r.hex}>
              {'★'.repeat(r.stars)}
            </Chip>
          ))}
        </div>
        {packs.length > 1 && (
          <select value={f.pack} onChange={e => patch({ pack: e.target.value })} aria-label="Pack" className={select}>
            <option value="">All packs</option>
            {packs.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <select value={f.show} onChange={e => patch({ show: e.target.value as DexShow })} aria-label="Show" className={select}>
          <option value="all">Everything</option>
          {showMine && <option value="collected">Collected ({progress.owned})</option>}
          {showMine && <option value="missing">Missing ({progress.total - progress.owned})</option>}
          {signedIn && <option value="wanted">Looking for ({wantedCount})</option>}
          <option value="undiscovered">Nobody has pulled it yet</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <select value={f.sort} onChange={e => patch({ sort: e.target.value as DexSort })} aria-label="Sort by" className={select}>
            {(Object.keys(SORT_LABELS) as DexSort[]).filter(k => k !== 'missing' || showMine).map(k => <option key={k} value={k}>Sort: {SORT_LABELS[k]}</option>)}
          </select>
          <button type="button" onClick={() => patch({ dir: f.dir === 1 ? -1 : 1 })} aria-label="Reverse the order" title="Reverse the order" className="rounded-xl border border-gray-700 px-2 py-2 text-gray-300 hover:text-white"><Icon name={f.dir === 1 ? 'arrowDown' : 'arrowUp'} /></button>
          <button type="button" onClick={() => setCompact(c => !c)} aria-pressed={compact} aria-label="Smaller cards" title="Smaller cards" className={`rounded-xl border px-2 py-2 ${compact ? 'border-yellow-500 text-yellow-300' : 'border-gray-700 text-gray-300 hover:text-white'}`}><Icon name="grid" /></button>
          {filtering && <button type="button" onClick={() => setF(DEFAULT_DEX)} className="text-xs text-yellow-400 hover:text-yellow-300">Clear</button>}
        </div>
      </div>
      {wantedError && <p role="alert" className="text-sm text-red-400">{wantedError}</p>}

      {shown.length === 0 ? (
        <p className="text-center text-gray-500 py-12 text-sm">No cards match.</p>
      ) : (
        <div className={compact ? 'grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-3' : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'}>
          {shown.map(c => {
            const rarity = getRarity(c.stars);
            const tileClass = 'holo-hover relative aspect-2/3 rounded-xl overflow-hidden border-2 bg-gray-900 cursor-pointer transition-transform hover:-translate-y-1 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-yellow-400';
            const style = { borderColor: rarity?.hex, boxShadow: `0 0 18px -6px ${rarity?.hex}` };
            const badges = (
              <>
                <span className="absolute top-1 left-1 bg-gray-950/85 text-gray-300 text-[10px] font-bold px-1.5 rounded-full">#{c.number}</span>
                {c.wanted && <span className="absolute bottom-1 left-1 bg-purple-500/90 text-white text-[10px] font-extrabold px-1.5 rounded-full" title="On your Looking for list"><Icon name="search" className="w-3 h-3" /></span>}
                {c.copies === 0 && <span className="absolute bottom-1 right-1 bg-gray-950/85 text-amber-300 text-[10px] font-bold px-1.5 rounded-full" title="Nobody has pulled this yet">unpulled</span>}
                {c.owned && <span className="absolute top-1 right-1 bg-emerald-500/90 text-gray-950 text-[10px] font-extrabold px-1.5 rounded-full" title="You own this card"><Icon name="check" className="w-3 h-3" /></span>}
              </>
            );
            return (
              <div key={c.id} className={`space-y-2 ${showMine && c.owned === false ? 'opacity-80' : ''}`}>
                {c.imageUrl ? (
                  <CardTile imageUrl={c.imageUrl} still={c.stillUrl} alt={c.name} title={`${c.name}. Click for details`} className={tileClass} style={style} onActivate={el => { opener.current = el; setOpenId(c.id); }}>
                    {badges}
                  </CardTile>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    className={tileClass}
                    style={style}
                    onClick={e => { opener.current = e.currentTarget; setOpenId(c.id); }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opener.current = e.currentTarget; setOpenId(c.id); } }}
                  >
                    {badges}
                  </div>
                )}
                <div className="text-center space-y-0.5">
                  <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                  <p className="text-xs" style={{ color: rarity?.hex }}>{'★'.repeat(c.stars)} {rarity?.label}</p>
                  <p className="text-[11px] text-gray-500">1 in {Math.round(1 / c.pullRate).toLocaleString()} · {c.copies} out there</p>
                  <p className="text-[11px] text-yellow-300/90 tabular-nums" title={c.upgradable ? 'Points per print: Regular · Reverse Holo · Full Art · Shiny' : 'Points per print'}>
                    {c.upgradable ? c.values.join(' · ') : c.values[0]} pts
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openIdx >= 0 && <DexDetail card={shown[openIdx]} seasonId={seasonId} siteHost={siteHost} signedIn={signedIn} onToggleWanted={toggleWanted} canStep={shown.length > 1} onClose={close} onStep={step} />}
    </div>
  );
}

// ── Detail dialog ─────────────────────────────────────────

function DexDetail({ card, seasonId, siteHost, signedIn, onToggleWanted, canStep, onClose, onStep }: { card: DexCard; seasonId: string; siteHost: string; signedIn: boolean; onToggleWanted: (c: DexCard) => void; canStep: boolean; onClose: () => void; onStep: (d: number) => void }) {
  const rarity = getRarity(card.stars);
  const [shown, setShown] = useState<Variant>('regular');
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => { setShown('regular'); }, [card.id]);

  useEffect(() => {
    closeBtn.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onStep(-1);
      else if (e.key === 'ArrowRight') onStep(1);
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose, onStep]);

  const rows: Variant[] = card.upgradable ? [...VARIANTS] : ['regular'];
  const art = artFor(card, shown);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`${card.name} details`}>
      <div className="absolute inset-0 bg-gray-950/85 backdrop-blur-xs" onClick={onClose} />

      <div className="card tcg-panel relative w-full max-w-4xl max-h-full overflow-y-auto rounded-2xl shadow-glow">
        <button ref={closeBtn} onClick={onClose} aria-label="Close" className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-gray-900/80 text-gray-300 hover:text-white text-xl leading-none">×</button>

        <div className="grid md:grid-cols-[240px_1fr] gap-6 p-5 sm:p-6">
          {/* Art */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 w-full justify-center">
              {canStep && <button onClick={() => onStep(-1)} aria-label="Previous card" className="w-8 h-12 shrink-0 rounded-lg border border-gray-700 text-gray-400 hover:text-white">‹</button>}
              <div
                className={`relative w-full max-w-[210px] aspect-2/3 rounded-xl overflow-hidden border-2 bg-gray-900 ${shown !== 'regular' ? `vfx-${shown}` : ''} ${holoClass(card.holo[shown], true)}`}
                style={{ borderColor: rarity?.hex, boxShadow: `0 0 24px -6px ${rarity?.hex}`, ...holoVars(card.holo[shown]), ['--art-mask' as string]: maskFor(card, art) } as React.CSSProperties}
              >
                <img src={stillFor(card, art)} alt={card.name} className="w-full h-full object-cover" />
                <FullArt url={art} />
              </div>
              {canStep && <button onClick={() => onStep(1)} aria-label="Next card" className="w-8 h-12 shrink-0 rounded-lg border border-gray-700 text-gray-400 hover:text-white">›</button>}
            </div>
            {card.upgradable && <p className="text-[11px] text-gray-500">Showing: {VARIANT_LABELS[shown]}</p>}
            <ShareImageButton
              spec={{ title: card.name, subtitle: `${'★'.repeat(card.stars)} ${rarity?.label ?? ''} · ${oneIn(card.pullRate)} per pack`, stats: [`${card.copies.toLocaleString()} out there`, `${card.collectors} collector${card.collectors === 1 ? '' : 's'}`], cards: [{ src: art, name: card.name, hex: rarity?.hex }], footer: siteHost }}
              filename={`cheesy-tcg-card-${card.number}.png`}
              label="Share this card"
              className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-gray-200 bg-white/6 border border-white/10 hover:bg-white/10 rounded-full px-3 py-1.5 transition-colors disabled:opacity-60 w-full max-w-[210px]"
            />
            {signedIn && (
              <button type="button" onClick={() => onToggleWanted(card)} aria-pressed={!!card.wanted} className={`inline-flex items-center justify-center gap-1.5 text-xs font-bold rounded-full border px-3 py-1.5 transition-colors w-full max-w-[210px] ${card.wanted ? 'border-purple-400/60 bg-purple-500/20 text-purple-100' : 'border-white/10 bg-white/6 text-gray-200 hover:bg-white/10'}`}>
                <Icon name="search" />{card.wanted ? 'On your Looking for list' : 'Add to Looking for'}
              </button>
            )}
          </div>

          {/* Info */}
          <div className="space-y-4 min-w-0">
            <div>
              <p className="text-xs text-gray-500">#{card.number} · {card.packName}</p>
              <h2 className="font-display text-3xl font-bold text-white leading-tight wrap-break-word">{card.name}</h2>
              <p className="text-sm font-semibold mt-1" style={{ color: rarity?.hex }}>{'★'.repeat(card.stars)} {rarity?.label}</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Stat label="Pull chance" tip="pullChance" value={oneIn(card.pullRate)} sub="per pack" />
              <Stat label="Prints out there" value={card.copies.toLocaleString()} sub="across everyone" />
              <Stat label="Collectors" value={card.collectors.toLocaleString()} sub="own at least one" />
            </div>

            {/* Versions */}
            <div className="rounded-xl border border-gray-800 overflow-hidden">
              <table className="table table-sm w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-gray-500 text-left bg-gray-950/50">
                    <th className="py-2 px-3 font-bold">Version</th>
                    {card.upgradable && <th className="py-2 px-2 font-bold text-right hidden sm:table-cell">Pull odds</th>}
                    <th className="py-2 px-2 font-bold text-right">Out there</th>
                    <th className="py-2 px-3 font-bold text-right">Worth each</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/70">
                  {rows.map(v => (
                    <tr
                      key={v}
                      onClick={() => card.upgradable && setShown(v)}
                      className={`${card.upgradable ? 'cursor-pointer hover:bg-white/3' : ''} ${v === shown && card.upgradable ? 'bg-white/4' : ''}`}
                    >
                      <td className="py-2 px-3 text-gray-200">{VARIANT_LABELS[v]}{VARIANT_TIPS[v] && <InfoTip term={VARIANT_TIPS[v]} />}</td>
                      {card.upgradable && <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap text-gray-500 hidden sm:table-cell">{oneIn(card.variantOdds[v])}</td>}
                      <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap text-gray-400">{card.variantCopies[v].toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap font-semibold text-yellow-300">{card.values[VARIANTS.indexOf(v)].toLocaleString()} pts</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {card.maths && <CardMathsPanel maths={card.maths} variants={rows} shown={shown} />}

            {card.copies > 0 && (
              <Link href={`/cards/${card.number}/copies?season=${encodeURIComponent(seasonId)}`} className="flex items-center justify-between gap-2 rounded-xl border border-gray-800 bg-gray-950/40 px-3 py-2.5 text-sm font-bold text-gray-300 hover:text-white hover:border-yellow-500/40 transition-colors">
                <span><Icon name="cheese" className="mr-1.5" />Browse every print</span><Icon name="chevronRight" className="text-gray-500" />
              </Link>
            )}

            {/* Top collectors */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-xl font-bold text-white">Top collectors</h3>
                {card.collectors > card.owners.length && <span className="text-xs text-gray-500">+{card.collectors - card.owners.length} more own it</span>}
              </div>
              {card.owners.length === 0 ? (
                <p className="rounded-xl bg-gray-950/50 border border-gray-800 px-4 py-5 text-sm text-gray-400 text-center">
                  Nobody owns this card yet. Be the first to pull it!
                </p>
              ) : (
                <ol className="divide-y divide-gray-800/70 rounded-xl border border-gray-800 overflow-hidden">
                  {card.owners.map((o, i) => {
                    const extras = VARIANTS.filter(v => v !== 'regular' && o.variants[v] > 0);
                    return (
                      <li key={o.username}>
                        <Link href={`/u/${o.username}`} className="flex items-center gap-3 px-3 py-2 hover:bg-white/4 transition-colors">
                          <span className="w-7 text-center text-sm font-bold text-gray-500 tabular-nums"><RankMedal rank={i + 1} /></span>
                          <Avatar src={o.avatar} name={o.username} className="w-8 h-8 text-xs" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-white truncate">{o.username}</span>
                            {extras.length > 0 && (
                              <span className="block text-[11px] text-fuchsia-300">
                                {extras.map(v => `${o.variants[v]}× ${SHORT[v]}`).join(' · ')}
                              </span>
                            )}
                          </span>
                          <span className="text-right shrink-0">
                            <span className="block font-display text-lg font-bold text-yellow-400 tabular-nums leading-none">×{o.copies}</span>
                            <span className="block text-[11px] text-gray-500 tabular-nums">{o.points.toLocaleString()} pts</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
              <p className="text-[11px] text-gray-600">Ranked by how many prints of this card they own, across all versions.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tip }: { label: string; value: string; sub: string; tip?: TermId }) {
  return (
    <div className="rounded-xl bg-gray-950/60 border border-gray-800 p-2.5 sm:p-3 min-w-0">
      <p className="text-[10px] sm:text-[11px] uppercase tracking-wide sm:tracking-wider text-gray-500 font-bold leading-tight">{label}{tip && <InfoTip term={tip} />}</p>
      <p className="font-display text-xl sm:text-2xl font-bold text-white tabular-nums whitespace-nowrap">{value}</p>
      <p className="text-[11px] text-gray-500">{sub}</p>
    </div>
  );
}

/** The animated full-resolution art, faded in over the thumbnail once loaded. */
function FullArt({ url }: { url: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(false); }, [url]);
  if (cardThumbUrl(url) === url) return null;
  return (
    <img
      src={url}
      alt=""
      aria-hidden
      onLoad={() => setReady(true)}
      className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${ready ? 'opacity-100' : 'opacity-0'}`}
    />
  );
}

function Chip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${active ? 'bg-yellow-500 text-gray-950 border-yellow-500' : 'border-gray-700 hover:text-white'}`}
      style={!active && color ? { color } : undefined}
    >
      {children}
    </button>
  );
}
