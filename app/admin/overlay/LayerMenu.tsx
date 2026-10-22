'use client';
import { useEffect } from 'react';
import { Icon, type IconName } from '@/app/components/Icon';
import { useOverlayEditor } from './OverlayEditorContext';

// The right-click menu on a layer (a preview part, a Layers row or a view heading).
export function LayerMenu() {
  const { layerMenu, closeLayerMenu, resetLayer, centerLayer, copyLayerToScenes, sceneCount, locked, toggleLock, duplicateSelected, copySelected, pasteClip, hasClip } = useOverlayEditor();
  useEffect(() => {
    if (!layerMenu) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeLayerMenu();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layerMenu, closeLayerMenu]);
  if (!layerMenu) return null;
  const { view, id, x, y } = layerMenu;
  const items: { label: string; icon: IconName; run: () => void }[] = id?.startsWith('custom:') ? [
    { label: 'Duplicate (Ctrl+J)', icon: 'copy', run: duplicateSelected },
    { label: 'Copy (Ctrl+C)', icon: 'copy', run: copySelected },
    ...(hasClip ? [{ label: 'Paste (Ctrl+V)', icon: 'copy' as IconName, run: pasteClip }] : []),
  ] : [
    { label: 'Reset position', icon: 'undo', run: () => resetLayer(view, id) },
    ...(id ? [{ label: locked.includes(id) ? 'Unlock' : 'Lock', icon: (locked.includes(id) ? 'unlock' : 'lock') as IconName, run: () => toggleLock([id]) }] : []),
    // A part's offset is relative to its normal spot, so only a whole view has a meaningful "centre".
    ...(id ? [] : [{ label: 'Center', icon: 'target' as IconName, run: () => centerLayer(view) }]),
    ...(sceneCount > 0 ? [{ label: 'Copy position to other scenes', icon: 'copy' as IconName, run: () => copyLayerToScenes(view, id) }] : []),
  ];
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={closeLayerMenu} onContextMenu={e => { e.preventDefault(); closeLayerMenu(); }} />
      <ul
        role="menu"
        className="fixed z-50 min-w-48 rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl"
        style={{ left: Math.min(x, window.innerWidth - 240), top: Math.min(y, window.innerHeight - 140) }}
      >
        {items.map(it => (
          <li key={it.label} role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => { it.run(); closeLayerMenu(); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-200 hover:bg-white/10"
            >
              <Icon name={it.icon} className="text-gray-400" />
              {it.label}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
