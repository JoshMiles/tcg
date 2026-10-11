'use client';
import { useEffect, useRef, useState } from 'react';
import { CardsEditor, cardsSignature, type CardRow } from '../../../components/CardsEditor';
import { saveCards } from '../../../draft-actions';
import type { OptionalVariant } from '@/lib/types';

/**
 * Bulk card editor for an existing pack. Unlike the wizard (which autosaves a hidden draft), a published
 * pack is live, so edits here are saved explicitly.
 */
export function BulkCards({
  packId, initial, upgradesEnabled, packDisabled, isDraft,
}: {
  packId: string; initial: CardRow[]; upgradesEnabled: boolean; packDisabled: OptionalVariant[]; isDraft: boolean;
}) {
  const [cards, setCards] = useState<CardRow[]>(initial);
  const saved = useRef(cardsSignature(initial));
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const dirty = cardsSignature(cards) !== saved.current;
  const uploading = cards.some(c => c.busy);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save() {
    setState('saving');
    setError('');
    const snapshot = cards;
    try {
      const result = await saveCards(packId, snapshot.map(({ number: _n, busy: _b, error: _e, ...r }) => r));
      saved.current = cardsSignature(snapshot);
      setCards(prev => prev.map(r => {
        const s = result.find(x => x.id === r.id);
        return s && s.number !== r.number ? { ...r, number: s.number } : r;
      }));
      setState('saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      setState('error');
    }
  }

  return (
    <div className="space-y-4">
      <CardsEditor cards={cards} setCards={setCards} upgradesEnabled={upgradesEnabled} packDisabled={packDisabled} confirmDelete={!isDraft} />

      {/* Sticky save bar */}
      <div className="sticky bottom-4 flex items-center justify-between gap-4 tcg-panel rounded-2xl px-5 py-3 shadow-glow">
        <p className={`text-sm font-medium ${state === 'error' ? 'text-red-400' : dirty ? 'text-yellow-300' : state === 'saved' ? 'text-green-400' : 'text-gray-500'}`} role="status">
          {state === 'error' ? error
            : state === 'saving' ? 'Saving…'
            : uploading ? 'Uploading images…'
            : dirty ? 'Unsaved changes'
            : state === 'saved' ? '✓ All changes saved'
            : 'No changes'}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || state === 'saving' || uploading}
          className="px-5 py-2 tcg-btn rounded-xl text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save changes
        </button>
      </div>
    </div>
  );
}
