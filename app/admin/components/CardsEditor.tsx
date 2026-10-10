'use client';
import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Card } from '@/lib/types';
import type { CardInput } from '../draft-actions';
import { RARITIES, getRarity, rarityStats } from '@/lib/rarity';
import { cardThumbUrl } from '@/lib/card-art';
import { uploadAudioFile, uploadImageFile } from './upload-client';

/** An editor row: the saved fields plus client-only upload state. `number` is assigned by the server. */
export interface CardRow extends CardInput {
  number?: number;
  busy?: string;   // upload in progress ("Uploading…")
  error?: string;
}

/** Sensible starting odds per star rating (relative weights, rarer = lower). */
export const DEFAULT_PROBABILITY: Record<number, number> = { 1: 60, 2: 30, 3: 15, 4: 8, 5: 3 };

export function newRow(over: Partial<CardRow> = {}): CardRow {
  return {
    id: crypto.randomUUID(),
    name: '',
    imageUrl: '',
    stars: 1,
    probability: DEFAULT_PROBABILITY[1],
    upgradesEnabled: true,
    ...over,
  };
}

/** The fields autosave cares about — excludes server-assigned numbers and transient upload state. */
export function cardsSignature(rows: CardRow[]): string {
  return JSON.stringify(rows.map(({ number: _n, busy: _b, error: _e, ...rest }) => rest));
}

const nameFromFile = (file: File) =>
  file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

const inputCls = 'bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors';

export function CardsEditor({
  cards,
  setCards,
  upgradesEnabled,
  confirmDelete = false,
}: {
  cards: CardRow[];
  setCards: Dispatch<SetStateAction<CardRow[]>>;
  upgradesEnabled: boolean;
  /** Ask before deleting a card that already has a number (i.e. may be in viewers' collections). */
  confirmDelete?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const patch = (id: string, p: Partial<CardRow>) =>
    setCards(prev => prev.map(c => (c.id === id ? { ...c, ...p } : c)));

  // ── Uploads ────────────────────────────────────────────
  async function uploadInto(id: string, file: File, field: 'imageUrl' | 'fullArtImageUrl' | 'soundUrl') {
    patch(id, { busy: 'Uploading…', error: undefined });
    try {
      const url = field === 'soundUrl'
        ? await uploadAudioFile(file)
        : await uploadImageFile(file, phase => patch(id, { busy: phase === 'optimizing' ? 'Optimizing GIF…' : 'Uploading…' }));
      patch(id, { [field]: url, busy: undefined });
    } catch (e) {
      patch(id, { busy: undefined, error: e instanceof Error ? e.message : 'Upload failed' });
    }
  }

  /** Each dropped image becomes a card; uploads run three at a time. */
  async function addFiles(fileList: FileList | File[]) {
    const files = [...fileList].filter(f => f.type.startsWith('image/') || /\.gif$/i.test(f.name));
    if (files.length === 0) return;
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const rows = files.map(f => newRow({ name: nameFromFile(f), busy: 'Waiting…' }));
    setCards(prev => [...prev, ...rows]);

    let cursor = 0;
    const worker = async () => {
      while (cursor < files.length) {
        const i = cursor++;
        await uploadInto(rows[i].id, files[i], 'imageUrl');
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  function setStars(c: CardRow, stars: number) {
    // Follow the default odds only if the admin hasn't customised this card's probability.
    const untouched = c.probability === DEFAULT_PROBABILITY[c.stars];
    patch(c.id, { stars, ...(untouched && { probability: DEFAULT_PROBABILITY[stars] }) });
  }

  function remove(c: CardRow) {
    if (confirmDelete && c.number && !window.confirm(`Delete "${c.name || 'this card'}" (#${c.number})? Viewers who already pulled it keep the entry, but the card will no longer show anywhere.`)) return;
    setCards(prev => prev.filter(x => x.id !== c.id));
  }

  const duplicate = (c: CardRow) =>
    setCards(prev => {
      const i = prev.findIndex(x => x.id === c.id);
      const copy = newRow({ ...c, id: crypto.randomUUID(), number: undefined, name: c.name ? `${c.name} copy` : '', busy: undefined, error: undefined });
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });

  const totalProb = cards.reduce((s, c) => s + (c.probability > 0 ? c.probability : 0), 0);
  const mix = rarityStats(cards as unknown as Card[]);

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); }}
        onClick={() => fileInput.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.current?.click(); } }}
        className={`cursor-pointer rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragging ? 'border-yellow-400 bg-yellow-500/10' : 'border-gray-700 hover:border-gray-500 bg-gray-900/40'
        }`}
      >
        <p className="text-white font-semibold">Drop card images here, or click to choose</p>
        <p className="text-xs text-gray-500 mt-1">
          Each image becomes a card, named from its filename. PNG, JPG, WebP or GIF — GIFs are shrunk automatically.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,.gif"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setCards(prev => [...prev, newRow()])} className="px-3 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors">
            + Blank card
          </button>
          <button
            type="button"
            disabled={cards.length === 0}
            onClick={() => setCards(prev => prev.map(c => ({ ...c, probability: DEFAULT_PROBABILITY[c.stars] ?? 10 })))}
            title="Set every card's probability from its star rating"
            className="px-3 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors disabled:opacity-40"
          >
            Suggest odds from stars
          </button>
        </div>
        <p className="text-xs text-gray-500 font-semibold">
          {cards.length} card{cards.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Rarity mix */}
      {mix.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {mix.map(r => (
            <span key={r.stars} className={`text-xs font-bold bg-white/5 rounded-md px-2 py-1 ${r.text}`}>
              {'★'.repeat(r.stars)} {r.count} <span className="text-gray-400 font-semibold">· {r.pct}% of pulls</span>
            </span>
          ))}
        </div>
      )}

      {/* Rows */}
      {cards.length === 0 ? (
        <p className="text-center text-sm text-gray-600 py-6">No cards yet — drop some images above.</p>
      ) : (
        <ul className="space-y-2">
          {cards.map((c, idx) => {
            const rarity = getRarity(c.stars);
            const pct = totalProb > 0 && c.probability > 0 ? (c.probability / totalProb) * 100 : 0;
            const missing = !c.name.trim() || !c.imageUrl;
            return (
              <li
                key={c.id}
                className={`tcg-panel rounded-xl p-3 flex flex-wrap items-start gap-3 ${missing && !c.busy ? 'ring-1 ring-red-500/30' : ''}`}
              >
                <span className="w-8 pt-2 text-center text-xs font-bold text-gray-600 tabular-nums" title="Card number">
                  {c.number ?? idx + 1}
                </span>

                {/* Art */}
                <ArtSlot
                  label="Card"
                  url={c.imageUrl}
                  busy={c.busy}
                  onFile={f => uploadInto(c.id, f, 'imageUrl')}
                  onClear={() => patch(c.id, { imageUrl: '' })}
                />

                <div className="flex-1 min-w-[220px] space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={c.name}
                      onChange={e => patch(c.id, { name: e.target.value })}
                      placeholder="Card name"
                      className={`${inputCls} flex-1 min-w-[140px]`}
                      aria-label="Card name"
                    />
                    <select
                      value={c.stars}
                      onChange={e => setStars(c, Number(e.target.value))}
                      className={inputCls}
                      aria-label="Rarity"
                      style={{ color: rarity?.hex }}
                    >
                      {RARITIES.map(r => <option key={r.stars} value={r.stars}>{'★'.repeat(r.stars)} {r.label}</option>)}
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-gray-500">
                      Odds
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={c.probability}
                        onChange={e => patch(c.id, { probability: Number(e.target.value) })}
                        className={`${inputCls} w-20`}
                        aria-label="Probability weight"
                      />
                      <span className="w-12 text-gray-400 tabular-nums">{pct > 0 ? `${pct.toFixed(1)}%` : '—'}</span>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                    <SoundSlot url={c.soundUrl} onFile={f => uploadInto(c.id, f, 'soundUrl')} onClear={() => patch(c.id, { soundUrl: undefined })} />
                    {upgradesEnabled && (
                      <>
                        <ArtSlot
                          label="Full art"
                          compact
                          url={c.fullArtImageUrl ?? ''}
                          onFile={f => uploadInto(c.id, f, 'fullArtImageUrl')}
                          onClear={() => patch(c.id, { fullArtImageUrl: undefined })}
                        />
                        <label className="flex items-center gap-1.5 text-gray-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={c.upgradesEnabled}
                            onChange={e => patch(c.id, { upgradesEnabled: e.target.checked })}
                            className="accent-yellow-400"
                          />
                          Variants &amp; upgrades
                        </label>
                      </>
                    )}
                  </div>
                  {c.error && <p className="text-xs text-red-400">{c.error}</p>}
                  {upgradesEnabled && c.upgradesEnabled && !c.fullArtImageUrl && c.imageUrl && (
                    <p className="text-[11px] text-gray-600">No full-art image — Full Art and Shiny will reuse the card art.</p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => duplicate(c)} title="Duplicate" className="px-2 py-1 text-xs text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">⧉</button>
                  <button type="button" onClick={() => remove(c)} title="Delete" className="px-2 py-1 text-xs text-red-500 hover:text-red-300 hover:bg-red-950/40 rounded-lg transition-colors">✕</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A thumbnail that doubles as an upload button; also accepts a dropped file. */
function ArtSlot({
  label, url, busy, compact, onFile, onClear,
}: {
  label: string; url: string; busy?: string; compact?: boolean;
  onFile: (f: File) => void; onClear: () => void;
}) {
  const size = compact ? 'w-8 h-12' : 'w-14 h-20';
  return (
    <div className={compact ? 'flex items-center gap-2' : 'flex flex-col items-center gap-1'}>
      <label
        className={`relative ${size} rounded-lg overflow-hidden border border-dashed border-gray-600 hover:border-yellow-500 bg-gray-950 flex items-center justify-center cursor-pointer transition-colors shrink-0`}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
        title={url ? `Replace ${label.toLowerCase()} image` : `Upload ${label.toLowerCase()} image`}
      >
        {url ? <img src={cardThumbUrl(url)} alt="" className="w-full h-full object-cover" /> : <span className="text-gray-600 text-lg">+</span>}
        {busy && (
          <span className="absolute inset-0 bg-gray-950/80 flex items-center justify-center text-[9px] text-yellow-300 text-center leading-tight px-0.5">{busy}</span>
        )}
        <input type="file" accept="image/*,.gif" className="hidden" disabled={!!busy} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      </label>
      {compact ? (
        <span className="text-gray-400">
          {label}
          {url && <button type="button" onClick={onClear} className="ml-1.5 text-gray-600 hover:text-red-400" title="Remove">✕</button>}
        </span>
      ) : null}
    </div>
  );
}

function SoundSlot({ url, onFile, onClear }: { url?: string; onFile: (f: File) => void; onClear: () => void }) {
  return (
    <span className="flex items-center gap-1.5 text-gray-400">
      <label className="cursor-pointer hover:text-white transition-colors">
        🔊 {url ? 'Sound set' : 'Add sound'}
        <input type="file" accept="audio/*,.mp3,.wav,.ogg" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      </label>
      {url && (
        <>
          <button type="button" onClick={() => void new Audio(url).play().catch(() => {})} className="text-gray-500 hover:text-white" title="Play">▶</button>
          <button type="button" onClick={onClear} className="text-gray-600 hover:text-red-400" title="Remove sound">✕</button>
        </>
      )}
    </span>
  );
}
