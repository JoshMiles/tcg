'use client';
import { ToolStrip, type ToolDef } from '../components/workspace/ToolStrip';
import { useOverlayEditor, type Tool } from './OverlayEditorContext';

const TOOLS: (ToolDef & { id: Tool })[] = [
  { id: 'move', label: 'Move', icon: 'move', shortcut: 'V' },
  { id: 'hand', label: 'Hand', icon: 'hand', shortcut: 'H' },
  { id: 'zoom', label: 'Zoom', icon: 'zoomIn', shortcut: 'Z' },
  { id: 'text', label: 'Text', icon: 'text', shortcut: 'T' },
  { id: 'shape', label: 'Shape', icon: 'stop', shortcut: 'U' },
  { id: 'image', label: 'Image', icon: 'image', shortcut: 'I' },
];

// The tool strip left of the canvas; holding Space shows Hand while it is held.
export function EditorToolStrip() {
  const { activeTool, setTool } = useOverlayEditor();
  return <ToolStrip tools={TOOLS} active={activeTool} onSelect={id => setTool(id as Tool)} />;
}
