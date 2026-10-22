'use client';
import { Dialog } from '../components/Dialog';
import { useOverlayEditor } from './OverlayEditorContext';

// Every editor shortcut, grouped. Opened with ? or Help > Keyboard shortcuts.
const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Tools',
    rows: [
      ['V', 'Move: select and drag parts'],
      ['T', 'Text: click the canvas to add a text layer, or drag to draw its box (Esc or V to leave)'],
      ['I', 'Image: click for a default image box, or drag to draw it; choose the file in the panel (Esc or V to leave)'],
      ['U', 'Shape: click for a default shape, or drag to draw it; Shift keeps proportions (Esc or V to leave)'],
      ['H', 'Hand: drag to pan (in the Layers panel, H hides or shows the layer)'],
      ['Z', 'Zoom: click to zoom in, Alt+click to zoom out'],
      ['Space (hold)', 'Temporary Hand'],
    ],
  },
  {
    title: 'View',
    rows: [
      ['Ctrl+0', 'Fit to the space'],
      ['Ctrl+1', '100% (one design pixel per screen pixel)'],
      ['Ctrl+R', 'Show or hide the rulers (drag from a ruler for a guide)'],
      ['Ctrl+= / Ctrl+-', 'Zoom in / out one step'],
      ['Ctrl+wheel', 'Zoom at the pointer'],
      ['Wheel / Shift+wheel', 'Pan up and down / sideways when zoomed in'],
      ['Tab', 'Hide or show the panels (from the canvas)'],
    ],
  },
  {
    title: 'Editing',
    rows: [
      ['Ctrl+S', 'Save'],
      ['Ctrl+Z', 'Undo'],
      ['Ctrl+Shift+Z / Ctrl+Y', 'Redo'],
      ['Arrow keys (Shift = 10 px)', 'Nudge the selected part'],
      ['Shift+click', 'Add a part to the selection, or take it out (canvas or Layers); drag, arrows and resize then act on all of them'],
      ['Esc / Ctrl+D', 'Deselect'],
      ['?', 'This list'],
    ],
  },
];

export function ShortcutsSheet() {
  const { shortcutsOpen, setShortcutsOpen } = useOverlayEditor();
  return (
    <Dialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard shortcuts" size="md">
      <div className="p-6 space-y-5 text-sm">
        {GROUPS.map(g => (
          <section key={g.title}>
            <h3 className="text-xs uppercase tracking-wide text-gray-500 mb-2">{g.title}</h3>
            <dl className="space-y-1.5">
              {g.rows.map(([keys, what]) => (
                <div key={keys} className="flex items-baseline gap-3">
                  <dt className="w-52 shrink-0 font-mono text-xs text-yellow-300">{keys}</dt>
                  <dd className="text-gray-300">{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <p className="text-xs text-gray-500">Shortcuts do nothing while you are typing in a field.</p>
      </div>
    </Dialog>
  );
}
