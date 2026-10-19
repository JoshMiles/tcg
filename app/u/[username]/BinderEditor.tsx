'use client';

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from '@/app/components/Icon';
import { cardThumbUrl } from '@/lib/card-art';
import { VARIANTS, VARIANT_LABELS, type VariantCounts } from '@/lib/variants';
import { autoFillPages } from '@/lib/binder';
import {
  BINDER_LIMITS, COVER_COLOURS, DEFAULT_BINDER, EMBLEMS, MATERIALS, MISSING_STYLES, PAGE_COLOURS, POCKET_STYLES, SORTS,
  addPage, capacity, clearPage, movePage, nextEmpty, reflowPages, removePage, renamePage, setSlot, swapSlots,
  type BinderConfig, type BinderPageCfg,
} from '@/lib/binder-config';
import type { Variant } from '@/lib/types';
import { Binder, type BinderEditorBridge } from './Binder';
import { saveBinderAction, saveCollectionViewAction } from './actions';
import type { GridCard } from './CollectionGrid';

type Tab = 'look' | 'layout' | 'pages' | 'cards';

const total = (c: VariantCounts) => VARIANTS.reduce((s, v) => s + c[v], 0);
const artOf = (c: GridCard) => cardThumbUrl(c.imageUrl);

const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${on ? 'bg-yellow-400 text-gray-950 border-yellow-400' : 'bg-white/4 text-gray-300 border-white/10 hover:bg-white/10'}`;
const input = 'input input-sm w-full';
const select = 'select select-sm w-full';
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <fieldset className="fieldset"><legend className="fieldset-legend">{label}</legend>{children}{hint && <p className="fieldset-label">{hint}</p>}</fieldset>;
}
function Switch({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return <label className="flex items-center justify-between gap-3 text-sm text-gray-200 cursor-pointer"><span>{label}</span><input type="checkbox" role="switch" checked={on} onChange={e => set(e.target.checked)} className="toggle toggle-sm toggle-primary" /></label>;
}

/** The owner's binder workspace: a live book with a side panel to restyle it, switch it to hand-placed pages and fill the pockets. */
export function BinderEditor({ cards, initial, seasonId, ownerLabel, onClose, visitorsBinder }: {
  /** Whether visitors currently see the binder first (UserSettings.collectionView). */
  visitorsBinder: boolean;
  cards: GridCard[];
  initial: BinderConfig;
  seasonId: string;
  ownerLabel: string;
  /** Called with the saved config after Save, or with nothing on Cancel. */
  onClose: (saved?: BinderConfig) => void;
}) {
  const [draft, setDraft] = useState<BinderConfig>(initial);
  const router = useRouter();
  const [first, setFirst] = useState(visitorsBinder);
  const [tab, setTab] = useState<Tab>('look');
  const [armed, setArmed] = useState<number | null>(null);
  const [selected, setSelected] = useState<{ page: number; slot: number } | null>(null);
  const [focus, setFocus] = useState<{ page: number; n: number } | null>(null);
  const [search, setSearch] = useState('');
  const [show, setShow] = useState<'all' | 'owned' | 'unplaced'>('all');
  const [error, setError] = useState('');
  const [saving, startSave] = useTransition();
  const focusN = useRef(0);

  const cap = capacity(draft);
  const custom = draft.mode === 'custom' && draft.pages.length > 0 && draft.pagesSeason === seasonId;
  const view: Tab = (tab === 'pages' || tab === 'cards') && !custom ? 'layout' : tab;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || first !== visitorsBinder;
  const byNumber = useMemo(() => new Map(cards.map(c => [c.number, c])), [cards]);
  const infos = useMemo(() => cards.map(c => ({ packName: c.packName, number: c.number, stars: c.stars, name: c.name, owned: total(c.counts) > 0 })), [cards]);

  const patch = (p: Partial<BinderConfig>) => setDraft(d => ({ ...d, ...p }));
  const setPages = (pages: BinderPageCfg[]) => setDraft(d => ({ ...d, pages, pagesSeason: seasonId }));
  const goPage = (page: number) => setFocus({ page, n: ++focusN.current });

  // Leave with unsaved changes: ask first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setArmed(null); setSelected(null); } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  function setMode(mode: 'auto' | 'custom') {
    if (mode === 'auto') { patch({ mode }); setSelected(null); setArmed(null); return; }
    // Start by hand from what the automatic layout shows now, so nothing is lost; pages made in another season don't apply here.
    const usable = draft.pages.length > 0 && draft.pagesSeason === seasonId;
    setDraft(d => ({ ...d, mode, pages: usable ? d.pages : autoFillPages(infos, d), pagesSeason: seasonId }));
    setTab('cards');
  }
  function resize(cols: number, rows: number) {
    setDraft(d => ({ ...d, cols, rows, pages: d.pages.length ? reflowPages(d.pages, cols * rows) : d.pages }));
    setSelected(null);
  }

  const place = (page: number, slot: number, card: number) => {
    const pages = setSlot(draft.pages, page, slot, { card, variant: null });
    setPages(pages);
    // Keep going: the next empty pocket becomes the target so a whole page can be filled by tapping cards.
    const next = nextEmpty(pages, page, slot);
    setSelected(next);
    if (next && next.page !== page) goPage(next.page); // turn the book to where the next pocket is
  };
  const bridge: BinderEditorBridge | undefined = custom ? {
    selected,
    focus,
    onSelect: (page, slot) => {
      if (armed !== null) { place(page, slot, armed); return; }
      setSelected(s => (s && s.page === page && s.slot === slot ? null : { page, slot }));
    },
    onDrop: (page, slot, payload) => {
      if (payload.startsWith('card:')) { const n = Number(payload.slice(5)); if (byNumber.has(n)) { setPages(setSlot(draft.pages, page, slot, { card: n, variant: null })); setSelected({ page, slot }); } }
      else if (payload.startsWith('slot:')) { const [, p, s] = payload.split(':').map(Number); if (Number.isInteger(p) && Number.isInteger(s)) { setPages(swapSlots(draft.pages, { page: p, slot: s }, { page, slot })); setSelected({ page, slot }); } }
    },
  } : undefined;

  const slot = selected ? draft.pages[selected.page]?.slots[selected.slot] ?? null : null;
  const slotCard = slot ? byNumber.get(slot.card) : undefined;

  function pickCard(c: GridCard) {
    if (!custom) return;
    if (selected) place(selected.page, selected.slot, c.number);
    else setArmed(a => (a === c.number ? null : c.number));
  }

  const placedCount = useMemo(() => new Map<number, number>(draft.pages.flatMap(p => p.slots).filter(Boolean).reduce((m, s) => m.set(s!.card, (m.get(s!.card) ?? 0) + 1), new Map<number, number>())), [draft.pages]);
  const trayCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards
      .filter(c => !q || c.name.toLowerCase().includes(q) || String(c.number) === q.replace('#', ''))
      .filter(c => show === 'all' || (show === 'owned' ? total(c.counts) > 0 : !placedCount.has(c.number)))
      .sort((a, b) => a.number - b.number);
  }, [cards, search, show, placedCount]);

  function save() {
    setError('');
    startSave(async () => {
      try {
        const saved = await saveBinderAction(draft);
        if (first !== visitorsBinder) { await saveCollectionViewAction(first ? 'binder' : 'grid'); router.refresh(); }
        onClose(saved);
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Try again.'); }
    });
  }
  function cancel() {
    if (dirty && !window.confirm('Throw away your changes to the binder?')) return;
    onClose();
  }

  const tabs: { id: Tab; label: string; needsCustom?: boolean }[] = [
    { id: 'look', label: 'Look' }, { id: 'layout', label: 'Layout' }, { id: 'pages', label: 'Pages', needsCustom: true }, { id: 'cards', label: 'Cards', needsCustom: true },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/6 px-4 py-3">
        <p className="text-sm text-gray-200"><Icon name="pencil" className="mr-2 text-yellow-400" /><strong className="text-white">Customising your binder.</strong> Changes show here at once; nothing is public until you save.</p>
        <div className="flex flex-wrap items-center gap-2">
          {error && <span role="alert" className="text-xs text-red-400">{error}</span>}
          <button type="button" onClick={() => { if (window.confirm('Go back to the default binder?')) { setDraft(DEFAULT_BINDER); setSelected(null); setArmed(null); } }} className="text-xs font-bold text-gray-400 hover:text-white px-2 py-1.5">Reset to default</button>
          <button type="button" onClick={cancel} className="text-sm font-bold text-gray-200 bg-white/6 border border-white/10 hover:bg-white/10 rounded-xl px-4 py-2">Cancel</button>
          <button type="button" onClick={save} disabled={saving || !dirty} className="tcg-btn px-5 py-2 text-sm rounded-xl disabled:opacity-50">{saving ? 'Saving…' : 'Save binder'}</button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem] items-start">
        <div className="min-w-0 space-y-3">
          <Binder cards={cards} ownerLabel={ownerLabel} onOpen={() => {}} config={draft} seasonId={seasonId} editor={bridge ?? { selected: null, onSelect: () => {}, onDrop: () => {}, focus }} />
          {custom && armed !== null && byNumber.get(armed) && (
            <p role="status" className="text-sm text-emerald-300 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2">
              Placing <strong>#{armed} {byNumber.get(armed)!.name}</strong>: tap pockets to fill them. <button type="button" onClick={() => setArmed(null)} className="underline ml-1">Done</button> <span className="text-emerald-300/60">(Esc)</span>
            </p>
          )}
        </div>

        <aside className="card tcg-panel rounded-2xl p-4 space-y-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto" aria-label="Binder settings">
          <div role="tablist" aria-label="Binder settings" className="flex flex-wrap gap-1.5">
            {tabs.map(t => {
              const off = !!t.needsCustom && !custom;
              return <button key={t.id} role="tab" type="button" aria-selected={view === t.id} disabled={off} title={off ? 'Switch Layout to "Placed by hand" first' : undefined} onClick={() => setTab(t.id)} className={`${chip(view === t.id)} disabled:opacity-40 disabled:cursor-not-allowed`}>{t.label}</button>;
            })}
          </div>

          {view === 'look' && (
            <div className="space-y-5">
              <Switch on={first} set={setFirst} label="Show visitors the binder first" />
              <Field label="Cover title"><input className={input} value={draft.title} maxLength={BINDER_LIMITS.title} placeholder={`${ownerLabel} binder`} onChange={e => patch({ title: e.target.value })} /></Field>
              <Field label="Cover subtitle"><input className={input} value={draft.subtitle} maxLength={BINDER_LIMITS.subtitle} placeholder="Leave empty to show your progress" onChange={e => patch({ subtitle: e.target.value })} /></Field>
              <Field label="Cover colour">
                <div className="flex flex-wrap gap-2">
                  {COVER_COLOURS.map(c => (
                    <button key={c.id} type="button" aria-label={c.label} aria-pressed={draft.cover === c.id} title={c.label} onClick={() => patch({ cover: c.id })}
                      className={`w-8 h-8 rounded-full border-2 ${draft.cover === c.id ? 'border-yellow-400 ring-2 ring-yellow-400/40' : 'border-white/20'}`} style={{ background: `linear-gradient(135deg, ${c.a}, ${c.c})` }} />
                  ))}
                </div>
              </Field>
              <Field label="Cover material"><div className="flex flex-wrap gap-2">{MATERIALS.map(m => <button key={m.id} type="button" aria-pressed={draft.material === m.id} onClick={() => patch({ material: m.id })} className={chip(draft.material === m.id)}>{m.label}</button>)}</div></Field>
              <Field label="Cover emblem">
                <div className="flex flex-wrap gap-2">
                  {EMBLEMS.map(e => (
                    <button key={e} type="button" aria-label={e === 'none' ? 'No emblem' : e} aria-pressed={draft.emblem === e} onClick={() => patch({ emblem: e })} className={`${chip(draft.emblem === e)} min-w-9`}>
                      {e === 'none' ? 'None' : <Icon name={e as IconName} />}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Page colour">
                <div className="flex flex-wrap gap-2">
                  {PAGE_COLOURS.map(c => (
                    <button key={c.id} type="button" aria-label={c.label} aria-pressed={draft.pageColour === c.id} title={c.label} onClick={() => patch({ pageColour: c.id })}
                      className={`w-8 h-8 rounded-lg border-2 ${draft.pageColour === c.id ? 'border-yellow-400 ring-2 ring-yellow-400/40' : 'border-white/20'}`} style={{ background: `linear-gradient(180deg, ${c.a}, ${c.b})` }} />
                  ))}
                </div>
              </Field>
              <Field label="Pockets"><div className="flex flex-wrap gap-2">{POCKET_STYLES.map(p => <button key={p.id} type="button" aria-pressed={draft.pocketStyle === p.id} onClick={() => patch({ pocketStyle: p.id })} className={chip(draft.pocketStyle === p.id)}>{p.label}</button>)}</div></Field>
              <Field label="Cards you don't have yet"><div className="flex flex-wrap gap-2">{MISSING_STYLES.map(p => <button key={p.id} type="button" aria-pressed={draft.missing === p.id} onClick={() => patch({ missing: p.id })} className={chip(draft.missing === p.id)}>{p.label}</button>)}</div></Field>
              <div className="space-y-2">
                <Switch on={draft.badges} set={v => patch({ badges: v })} label="Show ×N and version badges" />
                <Switch on={draft.holo} set={v => patch({ holo: v })} label="Holographic shimmer" />
              </div>
            </div>
          )}

          {view === 'layout' && (
            <div className="space-y-5">
              <Field label="How are pages filled?">
                <div className="flex flex-wrap gap-2">
                  <button type="button" aria-pressed={draft.mode === 'auto'} onClick={() => setMode('auto')} className={chip(draft.mode === 'auto')}>Automatic</button>
                  <button type="button" aria-pressed={draft.mode === 'custom'} onClick={() => setMode('custom')} className={chip(draft.mode === 'custom')}>Placed by hand</button>
                </div>
                <p className="text-xs text-gray-500">{draft.mode === 'auto' ? 'Cards are laid out for you, a pack at a time.' : 'You choose every pocket. Changing to this starts from the automatic layout, so you can tweak it.'}</p>
              </Field>
              <Field label="Pockets per page" hint={`${draft.cols} × ${draft.rows} = ${cap} pockets`}>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-gray-400 flex-1 min-w-0">Columns
                    <select className={`${select} mt-1`} value={draft.cols} onChange={e => resize(Number(e.target.value), draft.rows)}>
                      {Array.from({ length: BINDER_LIMITS.cols[1] - BINDER_LIMITS.cols[0] + 1 }, (_, i) => BINDER_LIMITS.cols[0] + i).map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-gray-400 flex-1 min-w-0">Rows
                    <select className={`${select} mt-1`} value={draft.rows} onChange={e => resize(draft.cols, Number(e.target.value))}>
                      {Array.from({ length: BINDER_LIMITS.rows[1] - BINDER_LIMITS.rows[0] + 1 }, (_, i) => BINDER_LIMITS.rows[0] + i).map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                </div>
              </Field>
              {draft.mode === 'auto' && (
                <>
                  <Field label="Order">
                    <select className={select} value={draft.sort} onChange={e => patch({ sort: e.target.value as BinderConfig['sort'] })}>{SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
                  </Field>
                  <div className="space-y-2">
                    <Switch on={draft.groupByPack} set={v => patch({ groupByPack: v })} label="A fresh page for each pack" />
                    <Switch on={draft.hideUncollected} set={v => patch({ hideUncollected: v })} label="Leave out cards I don't have" />
                  </div>
                </>
              )}
            </div>
          )}

          {view === 'pages' && custom && (
            <div className="space-y-3">
              <ol className="space-y-2">
                {draft.pages.map((p, i) => (
                  <li key={i} className="rounded-xl border border-gray-800 bg-gray-950/50 p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 tabular-nums w-5">{i + 1}</span>
                      <input className={input} value={p.title} maxLength={BINDER_LIMITS.pageTitle} placeholder="Page title" aria-label={`Title of page ${i + 1}`} onChange={e => setPages(renamePage(draft.pages, i, e.target.value))} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-xs">
                      <button type="button" onClick={() => goPage(i)} className="px-2 py-1 rounded-md bg-white/6 hover:bg-white/10 text-gray-200">Show</button>
                      <button type="button" onClick={() => setPages(movePage(draft.pages, i, i - 1))} disabled={i === 0} aria-label="Move up" className="px-2 py-1 rounded-md bg-white/6 hover:bg-white/10 text-gray-200 disabled:opacity-30"><Icon name="arrowUp" /></button>
                      <button type="button" onClick={() => setPages(movePage(draft.pages, i, i + 1))} disabled={i === draft.pages.length - 1} aria-label="Move down" className="px-2 py-1 rounded-md bg-white/6 hover:bg-white/10 text-gray-200 disabled:opacity-30"><Icon name="arrowDown" /></button>
                      <button type="button" onClick={() => setPages(clearPage(draft.pages, i))} className="px-2 py-1 rounded-md bg-white/6 hover:bg-white/10 text-gray-200">Empty</button>
                      <button type="button" onClick={() => { if (draft.pages.length === 1) return; setPages(removePage(draft.pages, i)); setSelected(null); }} disabled={draft.pages.length === 1} className="px-2 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-300 disabled:opacity-30">Delete</button>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={draft.pages.length >= BINDER_LIMITS.pages} onClick={() => { setPages(addPage(draft.pages, cap)); goPage(draft.pages.length); }} className={chip(false)}>+ Add a page</button>
                <button type="button" onClick={() => { if (window.confirm('Replace your pages with the automatic layout of your collection?')) { setPages(autoFillPages(infos, draft)); setSelected(null); } }} className={chip(false)}>Start again from my collection</button>
              </div>
              <p className="text-xs text-gray-500">{draft.pages.length} of {BINDER_LIMITS.pages} pages.</p>
            </div>
          )}

          {view === 'cards' && custom && (
            <div className="space-y-3">
              {slot && slotCard ? (
                <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/6 p-3 space-y-2">
                  <p className="text-sm text-white font-bold">#{slotCard.number} {slotCard.name}</p>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Version to show">
                    <button type="button" aria-pressed={slot.variant === null} onClick={() => setPages(setSlot(draft.pages, selected!.page, selected!.slot, { card: slot.card, variant: null }))} className={chip(slot.variant === null)}>Best I have</button>
                    {slotCard.variants.map((v: Variant) => (
                      <button key={v} type="button" aria-pressed={slot.variant === v} onClick={() => setPages(setSlot(draft.pages, selected!.page, selected!.slot, { card: slot.card, variant: v }))} className={chip(slot.variant === v)}>
                        {VARIANT_LABELS[v]}{slotCard.counts[v] === 0 ? ' (none yet)' : ''}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => { setPages(setSlot(draft.pages, selected!.page, selected!.slot, null)); }} className="text-xs text-red-300 hover:text-red-200">Take it out of this pocket</button>
                </div>
              ) : (
                <p className="text-xs text-gray-400 leading-relaxed">
                  {selected ? 'Pick a card below to put it in the highlighted pocket.' : 'Tap a pocket, then a card. Or tap a card first and then tap pockets to fill them one after another. You can also drag a card onto a pocket, and drag pockets to swap them.'}
                </p>
              )}
              <div className="flex items-center gap-2">
                <input type="search" className="input input-sm flex-1 min-w-40" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or #" aria-label="Search cards" />
                <select className="select select-sm w-fit max-w-full shrink-0" value={show} onChange={e => setShow(e.target.value as typeof show)} aria-label="Show">
                  <option value="all">All</option><option value="owned">I have</option><option value="unplaced">Not placed</option>
                </select>
              </div>
              <ul className="grid grid-cols-4 gap-2">
                {trayCards.map(c => {
                  const placed = placedCount.get(c.number) ?? 0;
                  const have = total(c.counts) > 0;
                  return (
                    <li key={c.id}>
                      <button
                        type="button" onClick={() => pickCard(c)} aria-pressed={armed === c.number} draggable
                        onDragStart={e => { e.dataTransfer.setData('text/plain', `card:${c.number}`); e.dataTransfer.effectAllowed = 'copy'; }}
                        title={`#${c.number} ${c.name}${have ? '' : ' · not collected yet'}${placed ? ` · in ${placed} pocket${placed === 1 ? '' : 's'}` : ''}`}
                        className={`relative block w-full rounded-lg overflow-hidden border-2 ${armed === c.number ? 'border-emerald-400' : 'border-transparent hover:border-yellow-400/60'}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={artOf(c)} alt="" loading="lazy" decoding="async" className={`w-full aspect-2/3 object-cover bg-gray-900 ${have ? '' : 'opacity-40 grayscale'}`} />
                        <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[10px] text-white text-center truncate px-0.5">#{c.number}</span>
                        {placed > 0 && <span className="absolute top-0.5 right-0.5 rounded-full bg-emerald-500 text-gray-950 w-4 h-4 grid place-items-center text-[10px]"><Icon name="check" /></span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {trayCards.length === 0 && <p className="text-xs text-gray-500">No cards match.</p>}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
