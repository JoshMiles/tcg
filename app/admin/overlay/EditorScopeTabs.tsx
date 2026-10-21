'use client';

import { useEffect, useState } from 'react';
import { DocTabs } from '../components/workspace/DocTabs';
import { useOverlayEditor } from './OverlayEditorContext';

// Which scopes are open as tabs is an editor aid only (kept in this browser, never saved); the select it replaced listed every scope.
const KEY = 'tcg:overlay-tabs';

export function EditorScopeTabs() {
  const { scope, setScope, packs, presets, packVals, changedLayout, changedGlobal, changedPacks, changedScenes } = useOverlayEditor();
  const [open, setOpen] = useState<string[]>([]);
  const all = [
    { id: 'global', label: 'Everything' },
    ...packs.map(p => ({ id: p.id, label: `Pack: ${p.name}` })),
    ...presets.map(x => ({ id: 'scene:' + x.id, label: `Scene: ${x.name}` })),
  ];
  const exists = (id: string) => all.some(a => a.id === id);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      if (Array.isArray(v)) setOpen(prev => [...new Set([...v.filter((x): x is string => typeof x === 'string'), ...prev])]);
    } catch { /* storage blocked or corrupt */ }
  }, []);
  const ids = [...new Set(['global', ...open.filter(exists), scope])];
  const dirtyOf = (id: string) => id === 'global' ? changedGlobal || changedLayout : id.startsWith('scene:') ? changedScenes.some(x => 'scene:' + x.id === id) : changedPacks.includes(id);
  // An updater, so the load and the scope effects on mount build on each other instead of overwriting the stored list.
  const save = (fn: (prev: string[]) => string[]) => setOpen(prev => {
    const next = fn(prev);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  // Opening a scope by any route (a menu, a Scenes row, the URL) also opens its tab.
  useEffect(() => { if (scope !== 'global') save(prev => (prev.includes(scope) ? prev : [...prev, scope])); }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <DocTabs
      tabs={ids.map(id => ({ id, label: all.find(a => a.id === id)?.label ?? id, dirty: dirtyOf(id), closable: id !== 'global' }))}
      active={scope}
      onSelect={setScope}
      onClose={id => { save(prev => prev.filter(x => x !== id)); if (scope === id) setScope('global'); }}
      add={{ label: 'Open another scope', options: all.filter(a => !ids.includes(a.id)).map(a => ({ ...a, label: a.label + (Object.keys(packVals[a.id] ?? {}).length ? ' ●' : '') })), onAdd: id => { save(prev => (prev.includes(id) ? prev : [...prev, id])); setScope(id); } }}
    />
  );
}
