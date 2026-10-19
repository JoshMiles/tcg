'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { getRarity } from '@/lib/rarity';
import type { PackInput } from '@/lib/pack-clean';
import { cardProblems } from '@/lib/pack-clean';
import {
  bulkApply, diffChanges, isEmptyChange, newWorkCard, publishChecklist, rebase, reviewLines, type CardFields, type Work, type WorkCard,
} from '@/lib/pack-editor-core';
import { DraftChip, StatusChip } from '../../../components/StatusChip';
import { ConfirmButton } from '../../../components/ConfirmButton';
import { Dialog } from '../../../components/Dialog';
import { PendingButton } from '../../../components/PendingButton';
import { useAutosave } from '../../../components/use-autosave';
import { duplicatePackAction, archivePackAction, restorePackAction } from '../../../pack-actions';
import { publishPack, unpublishPack } from '../../../draft-actions';
import { loadPackWorkspace, savePackChanges } from '../../../workspace-actions';
import type { WorkspaceState } from '@/lib/pack-save';
import type { CardBackEditorProps } from '../../../components/CardBackEditor';
import { CardList } from './CardList';
import { CardPanel } from './CardPanel';
import { PackPanel, type SeasonUse } from './PackPanel';
import { PreviewPane } from './PreviewPane';
import { GridView } from './GridView';
import { OddsView } from './OddsView';
import { ImportDialog, filesFromDrop } from './ImportDialog';
import { BulkPanel } from './BulkPanel';
import type { HoloSpecs } from '@/lib/holo-core';
import type { BuffDef } from '@/lib/buffs-core';

export type WorkspaceView = 'edit' | 'grid' | 'odds' | 'overview';

interface Base extends WorkspaceState {}

/**
 * The pack workspace (ROADMAP 20.2a): the card list on the left, a preview in the middle, the properties panel on the right.
 * Published packs are saved explicitly (Review, then Save) because a change is live on stream at once; drafts autosave. All edits
 * go into one working state with undo / redo; what is sent to the server is the change set against the revision you opened.
 */
export function PackWorkspace({ packId, initial, seasons, overrideCount, cardBack, overview, initialView, initialSelection, healthCount, holoByStars, onStream, buffs }: {
  holoByStars: Record<number, HoloSpecs>;
  /** The pack is drawn in the active season (the overlay preview only knows those). */
  onStream: boolean;
  packId: string;
  initial: WorkspaceState;
  seasons: SeasonUse[];
  overrideCount: number;
  cardBack: Omit<CardBackEditorProps, 'sample'> & { sampleFallback: { name: string; imageUrl: string } };
  overview: ReactNode;
  initialView: WorkspaceView;
  initialSelection: string | null;
  healthCount: number;
  buffs: BuffDef[];
}) {
  const [base, setBase] = useState<Base>(initial);
  const baseRef = useRef<Base>(initial);
  const [work, setWorkState] = useState<Work>(initial.work);
  const workRef = useRef<Work>(initial.work);
  const past = useRef<Work[]>([]);
  const future = useRef<Work[]>([]);
  const lastEdit = useRef({ key: '', at: 0 });
  const [, tick] = useState(0);

  const first = initial.work.cards[0]?.id ?? 'pack';
  const startSel = initialSelection === 'pack' || initial.work.cards.some(c => c.id === initialSelection) ? initialSelection! : first;
  const [selected, setSelected] = useState<Set<string>>(new Set([startSel]));
  const [focus, setFocus] = useState<string | null>(startSel);
  const anchor = useRef<string | null>(startSel);
  const [view, setView] = useState<WorkspaceView>(initialView);
  const [sheet, setSheet] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [importFiles, setImportFiles] = useState<File[] | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set()); // cards imported in this visit
  const [only, setOnly] = useState<Set<string> | null>(null); // the grid shows just these
  const [confirm, setConfirm] = useState<{ title: string; body: ReactNode; label: string; run: () => void } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState('');
  const [clashes, setClashes] = useState<string[]>([]);
  const [publishIssues, setPublishIssues] = useState<string[]>([]);
  const [acceptWarnings, setAcceptWarnings] = useState(false);
  const [problemsShown, setProblemsShown] = useState<{ id: string; name: string; messages: string[] }[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const isDraft = base.status === 'draft';

  const setWork = useCallback((w: Work) => { workRef.current = w; setWorkState(w); }, []);
  const setBaseBoth = useCallback((b: Base) => { baseRef.current = b; setBase(b); }, []);

  /** Every edit goes through here: it is undoable, and edits of the same field in quick succession count as one step. */
  const edit = useCallback((fn: (w: Work) => Work, key?: string) => {
    const cur = workRef.current;
    const next = fn(cur);
    if (next === cur) return;
    const now = Date.now();
    if (!(key && key === lastEdit.current.key && now - lastEdit.current.at < 800)) past.current = [...past.current.slice(-59), cur];
    lastEdit.current = { key: key ?? '', at: now };
    future.current = [];
    setWork(next);
    tick(n => n + 1);
  }, [setWork]);
  const undo = useCallback(() => { const p = past.current.pop(); if (!p) return; future.current.push(workRef.current); lastEdit.current = { key: '', at: 0 }; setWork(p); tick(n => n + 1); }, [setWork]);
  const redo = useCallback(() => { const f = future.current.pop(); if (!f) return; past.current.push(workRef.current); lastEdit.current = { key: '', at: 0 }; setWork(f); tick(n => n + 1); }, [setWork]);

  const changes = useMemo(() => diffChanges(base.work, work), [base.work, work]);
  const dirty = !isEmptyChange(changes);
  const changedIds = useMemo(() => new Set([...Object.keys(changes.update), ...changes.add.map(a => a.id)]), [changes]);
  const held = useMemo(() => new Set(base.held), [base.held]);

  // What would not pass its checks: every card is marked, but only a card you touched stops a save (the server does the same).
  const problemMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of work.cards) {
      const msgs = cardProblems({ name: c.name, stars: c.stars, probability: c.probability, number: c.number || 1, kind: c.kind, buffId: c.buffId }, work.cards.filter(o => o.id !== c.id && o.number).map(o => o.number));
      if (msgs.length > 0) m.set(c.id, msgs);
    }
    return m;
  }, [work.cards]);
  const problemIds = useMemo(() => new Set(problemMap.keys()), [problemMap]);
  const blocking = useMemo(() => [...problemMap.entries()].filter(([id]) => changedIds.has(id)), [problemMap, changedIds]);
  const nameMissing = !work.pack.name.trim();
  const blocked = !isDraft && (blocking.length > 0 || (nameMissing && 'name' in changes.pack));

  // ── Saving ─────────────────────────────────────────────
  const doSave = useCallback(async (confirmHeld = false): Promise<boolean> => {
    const sent = workRef.current;
    const b = baseRef.current;
    const cs = diffChanges(b.work, sent);
    if (isEmptyChange(cs)) return true;
    setSaving(true); setError(''); setProblemsShown([]);
    try {
      const r = await savePackChanges(packId, b.rev, cs, { confirmHeld });
      if (!r.ok) {
        if (r.kind === 'conflict') setConflict(r.message); else setError(r.message);
        if (r.problems) setProblemsShown(r.problems);
        return false;
      }
      setConflict('');
      setBaseBoth(r.state);
      const cur = workRef.current;
      if (cur === sent) { past.current = []; future.current = []; setWork(r.state.work); }
      else setWork({ ...cur, cards: cur.cards.map(c => (r.assigned[c.id] ? { ...c, number: r.assigned[c.id] } : c)) });
      tick(n => n + 1);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      return false;
    } finally { setSaving(false); }
  }, [packId, setBaseBoth, setWork]);

  // Drafts autosave (nothing is live); a conflict stops it and shows the banner.
  const auto = useAutosave(work, async () => { if (!(await doSave())) throw new Error('Not saved'); }, {
    enabled: isDraft && !conflict, signature: w => JSON.stringify(diffChanges(baseRef.current.work, w)),
  });

  // Someone else saved while this was open (a refresh brings new data): adopt it when nothing is unsaved here, else flag it.
  useEffect(() => {
    if (initial.rev === baseRef.current.rev) return;
    if (!isEmptyChange(diffChanges(baseRef.current.work, workRef.current))) { setConflict('Someone else saved this pack since you opened it.'); return; }
    setBaseBoth(initial); setWork(initial.work); past.current = []; future.current = [];
  }, [initial, setBaseBoth, setWork]);

  async function loadTheirs() {
    const theirs = await loadPackWorkspace(packId);
    if (!theirs) { setError('This pack no longer exists.'); return; }
    const r = rebase(baseRef.current.work, theirs.work, diffChanges(baseRef.current.work, workRef.current));
    setBaseBoth(theirs); setWork(r.work); past.current = []; future.current = []; setClashes(r.clashes); setConflict('');
  }

  const unsavedGuard = dirty && !isDraft;
  useEffect(() => {
    if (!unsavedGuard) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsavedGuard]);

  // The admin sidebar collapses while this workspace is open (and is restored afterwards).
  useEffect(() => {
    const w = window as Window & { __tcgSidebarForce?: boolean };
    w.__tcgSidebarForce = true;
    window.dispatchEvent(new CustomEvent('tcg:sidebar', { detail: true }));
    return () => { w.__tcgSidebarForce = false; window.dispatchEvent(new CustomEvent('tcg:sidebar', { detail: false })); };
  }, []);

  // ── Selection ──────────────────────────────────────────
  const select = useCallback((id: string, mode: 'replace' | 'toggle' | 'range', visible: string[]) => {
    if (id === 'pack') { setSelected(new Set(['pack'])); setFocus('pack'); setSheet(true); anchor.current = null; return; }
    if (mode === 'replace') { setSelected(new Set([id])); setFocus(id); setSheet(true); anchor.current = id; return; }
    setSelected(prev => {
      const n = new Set(prev); n.delete('pack');
      if (mode === 'toggle') { if (n.has(id)) n.delete(id); else n.add(id); anchor.current = id; setFocus(n.has(id) ? id : [...n][0] ?? null); return n; }
      const a = anchor.current ? visible.indexOf(anchor.current) : -1; const b = visible.indexOf(id);
      if (a < 0 || b < 0) { n.add(id); anchor.current = id; setFocus(id); return n; }
      for (const v of visible.slice(Math.min(a, b), Math.max(a, b) + 1)) n.add(v);
      setFocus(id); return n;
    });
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    q.delete('tab');
    if (focus && selected.size === 1) q.set('card', focus); else q.delete('card');
    if (view !== 'edit') q.set('view', view); else q.delete('view');
    const s = q.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${s ? `?${s}` : ''}`);
  }, [focus, selected, view]);

  const cardIds = selected.has('pack') ? [] : [...selected].filter(id => work.cards.some(c => c.id === id));
  const active = cardIds.length === 1 ? work.cards.find(c => c.id === cardIds[0]) ?? null : null;
  const showPack = focus === 'pack' && selected.has('pack');

  function addCard() {
    const id = crypto.randomUUID();
    edit(w => ({ ...w, cards: [...w.cards, newWorkCard(id)] }));
    setSelected(new Set([id])); setFocus(id); anchor.current = id; setSheet(true); setView('edit');
    setTimeout(() => (document.getElementById('cw-name') as HTMLInputElement | null)?.focus(), 50);
  }
  function removeCards(ids: string[]) {
    const gone = new Set(ids);
    const heldOnes = work.cards.filter(c => gone.has(c.id) && c.number && held.has(c.number));
    const run = () => { edit(w => ({ ...w, cards: w.cards.filter(c => !gone.has(c.id)) })); setSelected(new Set(['pack'])); setFocus('pack'); setSheet(false); };
    setConfirm({
      title: ids.length === 1 ? 'Remove this card?' : `Remove ${ids.length} cards?`, label: 'Remove',
      body: <>
        <p>{ids.length === 1 ? 'The card is removed when you save.' : 'These cards are removed when you save.'} You can undo until then.</p>
        {heldOnes.length > 0 && <p className="mt-2 text-red-300"><strong>{heldOnes.map(c => `#${c.number} ${c.name}`).join(', ')}</strong> {heldOnes.length === 1 ? 'is' : 'are'} held by viewers. Removing {heldOnes.length === 1 ? 'it' : 'them'} takes the copies out of their collections and changes scores.</p>}
      </>,
      run,
    });
  }

  // Keyboard: / search, j / k move, Ctrl+A select all, Ctrl+Z / Y undo and redo, Ctrl+S save.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (!isDraft && dirty && !blocked) setReviewOpen(true); return; }
      if (typing || confirm || reviewOpen) return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); const ids = [...document.querySelectorAll<HTMLElement>('[data-card-row]')].map(r => r.dataset.cardRow!); setSelected(new Set(ids)); setFocus(ids[0] ?? null); return; }
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return; }
      if (['j', 'k', 'ArrowDown', 'ArrowUp'].includes(e.key) && !mod) {
        const rows = [...document.querySelectorAll<HTMLElement>('[data-card-row]')];
        const i = rows.findIndex(r => r.dataset.cardRow === focus);
        const n = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'j' || e.key === 'ArrowDown' ? 1 : -1)))];
        if (n) { e.preventDefault(); select(n.dataset.cardRow!, 'replace', rows.map(r => r.dataset.cardRow!)); setSheet(false); n.scrollIntoView({ block: 'nearest' }); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, dirty, blocked, isDraft, confirm, reviewOpen, undo, redo, select]);

  const patchCard = (id: string) => (patch: Partial<CardFields>, key?: string) => edit(w => ({ ...w, cards: w.cards.map(c => (c.id === id ? { ...c, ...patch } : c)) }), key ? `${id}:${key}` : undefined);
  const editCards = (fn: (cards: WorkCard[]) => WorkCard[], key?: string) => edit(w => { const next = fn(w.cards); return next === w.cards ? w : { ...w, cards: next }; }, key);
  const patchPack = (patch: Partial<PackInput>, key?: string) => edit(w => ({ ...w, pack: { ...w.pack, ...patch } }), key ? `pack:${key}` : undefined);

  const review = useMemo(() => reviewLines(base.work, work), [base.work, work]);
  const removedHeld = base.work.cards.filter(c => changes.remove.includes(c.id) && held.has(c.number));
  const packChanged = Object.keys(changes.pack).length > 0;
  const saveLabel = saving ? 'Saving…' : 'Save';

  // Imported cards keep their "set stars and odds" mark until either changes from the starting 1 and 1.
  const needsOdds = useMemo(() => new Set(work.cards.filter(c => fresh.has(c.id) && c.stars === 1 && c.probability === 1).map(c => c.id)), [fresh, work.cards]);
  const checklist = useMemo(
    () => publishChecklist(work, { inSeason: seasons.length > 0, needsOddsCount: needsOdds.size, warningsAccepted: acceptWarnings }),
    [work, seasons.length, needsOdds.size, acceptWarnings],
  );

  async function publish() {
    setPublishIssues([]);
    if (!checklist.canPublish) return;
    if (!(await doSave())) return;
    const r = await publishPack(packId, work.pack.active);
    if (!r.ok) { setPublishIssues(r.issues.map(i => i.message)); return; }
    window.location.reload();
  }
  const sampleCard = work.cards.find(c => c.imageUrl) ?? null;
  const previewProps = {
    packId, pack: work.pack, card: showPack ? null : active, selection: work.cards.filter(c => cardIds.includes(c.id)), cards: work.cards, holoByStars,
    cardBack: cardBack.initial, seasonName: cardBack.seasonName, onStream,
  };

  return (
    <div className="flex flex-col gap-3 xl:h-[calc(100vh-4rem)] min-h-0">
      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href="/admin/packs" className="text-sm text-gray-500 hover:text-white" aria-label="All packs"><Icon name="chevronLeft" /></Link>
        <h1 className="text-xl font-bold text-white truncate max-w-[16rem]">{work.pack.name || 'Untitled pack'}</h1>
        {base.archived ? <span className="text-[11px] font-extrabold uppercase tracking-wider rounded-full border border-gray-600 text-gray-400 px-2.5 py-1">Archived</span> : isDraft ? <DraftChip /> : <StatusChip active={work.pack.active} activeLabel="Live" inactiveLabel="Inactive" />}
        <span className="text-xs text-gray-500 hidden sm:inline">{seasons.length > 0 ? seasons.map(s => s.name).join(', ') : 'No season'}</span>
        <span role="status" className="text-xs text-gray-400 ml-auto sm:ml-2">
          {saving || auto.state === 'saving' ? 'Saving…' : conflict ? 'Not saved' : dirty ? (isDraft ? 'Saving soon…' : 'Unsaved changes') : 'All changes saved'}
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          <button type="button" onClick={undo} disabled={past.current.length === 0} aria-label="Undo" title="Undo (Ctrl+Z)" className="p-2 rounded-lg border border-gray-700 text-gray-200 disabled:opacity-40 hover:border-gray-500"><Icon name="undo" /></button>
          <button type="button" onClick={redo} disabled={future.current.length === 0} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" className="p-2 rounded-lg border border-gray-700 text-gray-200 disabled:opacity-40 hover:border-gray-500"><Icon name="redo" /></button>
          {!isDraft && <button type="button" onClick={() => setReviewOpen(true)} disabled={!dirty} className="px-3 py-2 text-sm font-semibold rounded-lg border border-gray-700 text-gray-200 disabled:opacity-40 hover:border-gray-500">Review changes{dirty ? ` (${review.length})` : ''}</button>}
          {!isDraft && <button type="button" onClick={() => void doSave()} disabled={!dirty || saving || blocked || !!conflict} className="px-4 py-2 btn btn-primary rounded-lg text-sm disabled:opacity-50">{saveLabel}</button>}
          {isDraft && (
            <details className="relative">
              <summary
                aria-label="Publish checklist"
                className="list-none cursor-pointer flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border border-gray-700 text-gray-200 hover:border-gray-500"
              >
                <Icon
                  name={checklist.blocking.length === 0 && checklist.warnings.length === 0 ? 'checkCircle' : 'warning'}
                  className={checklist.blocking.length > 0 ? 'text-red-400' : checklist.warnings.length > 0 ? 'text-amber-400' : 'text-emerald-400'}
                />
                <span>Publish checklist</span>
                <span className="text-[11px] font-bold rounded-full bg-white/10 px-1.5 py-0.5 tabular-nums">
                  {checklist.items.filter(i => i.ok).length}/{checklist.items.length}
                </span>
              </summary>
              <div className="absolute right-0 z-30 mt-1 w-80 sm:w-96 rounded-xl border border-gray-700 bg-gray-900 p-4 shadow-xl space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Publish checklist</p>
                <ul className="space-y-2 text-xs">
                  {checklist.items.map(item => (
                    <li key={item.id} className="flex items-start gap-2">
                      <Icon
                        name={item.ok ? 'checkCircle' : 'warning'}
                        className={`w-4 h-4 mt-0.5 shrink-0 ${item.ok ? 'text-emerald-400' : item.kind === 'blocking' ? 'text-red-400' : 'text-amber-400'}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={item.ok ? 'text-gray-200 font-semibold' : item.kind === 'blocking' ? 'text-red-200 font-semibold' : 'text-amber-200 font-semibold'}>
                          {item.label}
                          {!item.ok && <span className="ml-1.5 text-[10px] uppercase tracking-wider opacity-80">({item.kind === 'blocking' ? 'required' : 'warning'})</span>}
                        </p>
                        <p className="text-gray-400">{item.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                {checklist.warnings.length > 0 && (
                  <label className="flex items-start gap-2 pt-2 border-t border-gray-800 text-xs text-amber-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acceptWarnings}
                      onChange={e => setAcceptWarnings(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>{seasons.length === 0 ? 'Accept warnings and publish without a season' : 'Accept warnings and allow publishing'}</span>
                  </label>
                )}
                <label className="flex items-center gap-2 pt-2 border-t border-gray-800 text-xs text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={work.pack.active}
                    onChange={e => patchPack({ active: e.target.checked })}
                    className="toggle toggle-xs toggle-primary"
                  />
                  <span>Include in draws as soon as it&apos;s published</span>
                </label>
              </div>
            </details>
          )}
          {isDraft && (
            <button
              type="button"
              onClick={() => void publish()}
              disabled={saving || !!conflict || !checklist.canPublish}
              title={!checklist.canPublish ? (checklist.blocking[0]?.detail ?? 'Accept warnings in the publish checklist first') : 'Publish this pack'}
              className="px-4 py-2 btn btn-primary rounded-lg text-sm disabled:opacity-50"
            >
              Publish
            </button>
          )}
          <details className="relative">
            <summary className="list-none cursor-pointer p-2 rounded-lg border border-gray-700 text-gray-200 hover:border-gray-500" aria-label="Pack actions"><Icon name="menu" /></summary>
            <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-gray-700 bg-gray-900 p-1.5 shadow-xl space-y-1">
              <form action={duplicatePackAction.bind(null, packId)}><PendingButton type="submit" pendingLabel="Duplicating…" className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/5 rounded-lg"><Icon name="copy" className="mr-2" />Duplicate as a draft</PendingButton></form>
              {!isDraft && <form action={(base.archived ? restorePackAction : archivePackAction).bind(null, packId)}><PendingButton type="submit" className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/5 rounded-lg"><Icon name={base.archived ? 'undo' : 'inbox'} className="mr-2" />{base.archived ? 'Restore' : 'Archive'}</PendingButton></form>}
              {!isDraft && (
                <form action={unpublishPack.bind(null, packId)}>
                  <ConfirmButton title="Move pack to drafts?" confirmLabel="Move to drafts" message={<>Move <strong className="text-white">{work.pack.name}</strong> back to a draft? It stops being drawn. Its cards and settings are kept.</>} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/5 rounded-lg">Move to drafts</ConfirmButton>
                </form>
              )}
            </div>
          </details>
        </div>
      </div>

      {conflict && (
        <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-100 flex flex-wrap items-center gap-3">
          <span className="flex-1">{conflict} Your unsaved changes are kept.</span>
          <button type="button" onClick={() => void loadTheirs()} className="px-3 py-1.5 font-bold rounded-lg bg-amber-500/20 hover:bg-amber-500/30">Load their version</button>
        </div>
      )}
      {clashes.length > 0 && (
        <div role="status" className="rounded-xl border border-sky-500/30 bg-sky-950/20 px-4 py-3 text-sm text-sky-100">
          Their version is loaded and your changes were re-applied. {clashes.length === 1 ? 'This clashed, so their value was kept' : 'These clashed, so their values were kept'}: {clashes.join('; ')}.
          <button type="button" onClick={() => setClashes([])} className="ml-3 underline">Dismiss</button>
        </div>
      )}
      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-300">Not saved: {error}</p>}
      {problemsShown.length > 0 && <ul role="alert" className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-300 space-y-1">{problemsShown.map(p => <li key={p.id}><strong>{p.name || 'Untitled'}</strong>: {p.messages.join(' ')}</li>)}</ul>}
      {publishIssues.length > 0 && <ul role="alert" className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-300 list-disc pl-8">{publishIssues.map(i => <li key={i}>{i}</li>)}</ul>}
      {base.archived && <p className="rounded-xl border border-gray-600/40 bg-gray-800/40 px-4 py-2.5 text-sm text-gray-300">This pack is <strong>archived</strong>: hidden from the library and never drawn. Restore it from the menu to bring it back.</p>}

      {/* ── View switch ── */}
      <div role="tablist" aria-label="Pack views" className="flex gap-1 border-b border-gray-800">
        {([['edit', 'Edit'], ['grid', 'Grid'], ['odds', 'Odds and simulator'], ['overview', 'Overview']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={view === id} type="button" onClick={() => setView(id)}
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${view === id ? 'border-yellow-400 text-yellow-300' : 'border-transparent text-gray-400 hover:text-white'}`}>
            {label}{id === 'overview' && healthCount > 0 ? <span className="ml-1.5 text-[10px] bg-amber-500/20 text-amber-300 rounded-full px-1.5 py-0.5">{healthCount}</span> : null}
          </button>
        ))}
      </div>

      {view === 'grid' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] flex-1 min-h-0">
          <GridView pack={work.pack} cards={work.cards} held={held} selected={selected} focus={focus} problemIds={problemIds} onSelect={select} editCards={editCards} only={only} onShowAll={() => setOnly(null)} />
          {cardIds.length > 0 && <aside aria-label="Bulk edits" className="card rounded-2xl overflow-y-auto min-h-0"><BulkPanel selected={work.cards.filter(c => cardIds.includes(c.id))} held={held} onApply={op => edit(w => ({ ...w, cards: bulkApply(w.cards, new Set(cardIds), op) }))} onRemove={removeCards} /></aside>}
        </div>
      )}

      {view === 'odds' && <div className="min-h-0 xl:overflow-y-auto"><OddsView pack={work.pack} cards={work.cards} baseCards={base.work.cards} editCards={editCards} /></div>}
      {view === 'overview' && <div className="min-h-0 xl:overflow-y-auto">{overview}</div>}

      {view === 'edit' && (
        <div className="grid gap-4 xl:grid-cols-[19rem_minmax(0,1fr)_25rem] flex-1 min-h-0">
          <div className="card rounded-2xl overflow-hidden min-h-0 xl:h-full max-h-[70vh] xl:max-h-none"
            onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
            onDrop={async e => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); const f = await filesFromDrop(e.dataTransfer); if (f.length) setImportFiles(f); }}>
            <CardList
              pack={work.pack} cards={work.cards} problemIds={problemIds} selected={selected} focus={focus} changedIds={changedIds}
              packRow={{ changed: packChanged, problem: nameMissing }} onSelect={select} onAdd={addCard} onImport={setImportFiles} needsOdds={needsOdds}
              onDeleteSelected={() => removeCards(cardIds)} searchRef={searchRef}
            />
          </div>

          <div className="hidden xl:flex flex-col items-center justify-center min-h-0 overflow-y-auto">
            <PreviewPane {...previewProps} />
          </div>

          <aside aria-label="Properties" className={`${sheet ? 'fixed inset-0 z-40 bg-gray-950 overflow-y-auto' : 'hidden'} xl:static xl:block xl:z-auto xl:bg-transparent card xl:rounded-2xl xl:overflow-y-auto min-h-0`}>
            <div className="xl:hidden sticky top-0 z-10 bg-gray-950 border-b border-gray-800 p-3 flex items-center gap-3">
              <button type="button" onClick={() => setSheet(false)} className="px-3 py-1.5 text-sm font-bold text-yellow-400"><Icon name="chevronLeft" /> Back to the list</button>
              <span className="text-xs text-gray-500 ml-auto">{saving ? 'Saving…' : dirty ? (isDraft ? 'Saving soon…' : 'Unsaved changes') : 'Saved'}</span>
            </div>
            <div className="xl:hidden p-4 flex justify-center"><PreviewPane {...previewProps} compact /></div>
            {cardIds.length > 1 ? (
              <BulkPanel selected={work.cards.filter(c => cardIds.includes(c.id))} held={held} onApply={op => edit(w => ({ ...w, cards: bulkApply(w.cards, new Set(cardIds), op) }))} onRemove={removeCards} />
            ) : active ? (
              <CardPanel
                card={active} cards={work.cards} pack={work.pack} locked={held.has(active.number)}
                changed={new Set(Object.keys(changes.update[active.id] ?? {}) as (keyof CardFields)[])}
                onChange={patchCard(active.id)} onRemove={() => removeCards([active.id])} buffs={buffs}
              />
            ) : (
              <PackPanel
                packId={packId} pack={work.pack} base={base.work.pack} onChange={patchPack} seasons={seasons} overrideCount={overrideCount}
                readOnlyStatus={isDraft ? 'draft' : 'published'}
                cardBack={{ ...cardBack, sample: { name: sampleCard?.name || cardBack.sampleFallback.name, imageUrl: sampleCard?.imageUrl || work.pack.coverImageUrl || cardBack.sampleFallback.imageUrl, hex: sampleCard ? getRarity(sampleCard.stars)?.hex : undefined }, packName: work.pack.name || cardBack.packName, coverImageUrl: work.pack.coverImageUrl || undefined }}
              />
            )}
          </aside>
        </div>
      )}

      {importFiles && (
        <ImportDialog
          files={importFiles} existing={work.cards} onClose={() => setImportFiles(null)}
          onApply={(fn, ids) => { editCards(fn); if (ids.length > 0) { setFresh(f => new Set([...f, ...ids])); setOnly(o => new Set([...(o ?? []), ...ids])); setView('grid'); } }}
        />
      )}

      {/* ── Review changes ── */}
      <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} title="Review changes" size="lg">
        <div className="space-y-4">
          {review.length === 0 ? <p className="text-sm text-gray-400">Nothing has changed.</p> : (
            <ul className="max-h-[50vh] overflow-y-auto divide-y divide-gray-800 text-sm">
              {review.map((l, i) => (
                <li key={i} className="py-2 flex flex-wrap gap-x-2 gap-y-0.5">
                  <span className="text-gray-400 min-w-28">{l.scope}</span>
                  <span className="text-gray-300">{l.field}</span>
                  <span className="text-gray-500 line-through break-all">{l.from}</span><span className="text-gray-600">to</span><span className="text-yellow-200 break-all">{l.to}</span>
                </li>
              ))}
            </ul>
          )}
          {removedHeld.length > 0 && <p className="text-sm text-red-300 rounded-lg border border-red-500/30 bg-red-950/20 p-3"><strong>{removedHeld.map(c => `#${c.number} ${c.name}`).join(', ')}</strong> {removedHeld.length === 1 ? 'is' : 'are'} held by viewers. Saving takes the copies out of their collections and changes scores. This can&apos;t be undone.</p>}
          {blocking.length > 0 && <ul className="text-sm text-red-300 space-y-1">{blocking.map(([id, m]) => <li key={id}><strong>{work.cards.find(c => c.id === id)?.name || 'Untitled'}</strong>: {m.join(' ')}</li>)}</ul>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setReviewOpen(false)} className="px-4 py-2 text-sm text-gray-300 hover:text-white">Cancel</button>
            <button type="button" disabled={saving || blocked || !dirty || !!conflict} onClick={async () => { if (await doSave(removedHeld.length > 0)) setReviewOpen(false); }} className="px-4 py-2 btn btn-primary rounded-lg text-sm disabled:opacity-50">{removedHeld.length > 0 ? 'Save and remove held cards' : 'Save'}</button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title} size="sm">
        <div className="space-y-4 text-sm text-gray-300">
          {confirm?.body}
          <div className="flex justify-end gap-2">
            <button type="button" autoFocus onClick={() => setConfirm(null)} className="px-4 py-2 text-sm text-gray-300 hover:text-white">Cancel</button>
            <button type="button" onClick={() => { confirm?.run(); setConfirm(null); }} className="px-4 py-2 text-sm font-bold rounded-lg bg-red-600 hover:bg-red-500 text-white">{confirm?.label}</button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
