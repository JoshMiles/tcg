'use client';

import { useState } from 'react';
import { diffLooks, type LookValues } from '@/lib/overlay-diff';
import { Dialog } from '../components/Dialog';
import { StillFrame } from './ArtboardStrip';
import { DiffList } from './EditorMenus';
import { useOverlayEditor } from './OverlayEditorContext';

const NOW = 'now';

// Versions > Compare: two looks (saved versions or the editor's current values) as live stills side by side, with the list of differences between them.
export function CompareDialog({ startId, onClose }: { startId: string; onClose: () => void }) {
  const { versionList, layout, globalVals, packVals, packs } = useOverlayEditor();
  const [a, setA] = useState(startId);
  const [b, setB] = useState(NOW);
  const look = (id: string): LookValues => versionList.find(v => v.id === id) ?? { layout, props: globalVals, packs: packVals };
  const name = (id: string) => { const v = versionList.find(x => x.id === id); return v ? `${v.note || 'Saved'} (${new Date(v.at).toLocaleString('en-GB', { timeZone: 'UTC' })})` : 'Current editor values'; };
  const diffs = diffLooks(look(a), look(b), id => packs.find(x => x.id === id)?.name ?? id);
  const pick = (value: string, set: (v: string) => void, label: string) => (
    <select aria-label={label} value={value} onChange={e => set(e.target.value)} className="w-full rounded-lg border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200">
      <option value={NOW}>{name(NOW)}</option>
      {versionList.map(v => <option key={v.id} value={v.id}>{name(v.id)}</option>)}
    </select>
  );
  return (
    <Dialog open onClose={onClose} title="Compare versions" size="lg">
      <div className="space-y-3 p-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          {([[a, setA, 'Left'], [b, setB, 'Right']] as const).map(([id, set, label]) => (
            <div key={label} className="space-y-1.5">
              {pick(id, set, `${label} side`)}
              <StillFrame name={`${label} side`} layout={look(id).layout} props={look(id).props} boxW={280} boxH={170} />
            </div>
          ))}
        </div>
        {diffs.length === 0 ? <p className="text-xs text-gray-500">No differences.</p> : <DiffList diffs={diffs} />}
      </div>
    </Dialog>
  );
}
