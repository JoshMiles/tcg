'use client';
// The options bar's text row for the Overlay Editor (ROADMAP 38.31): feeds the shared TextOptionsBar from the Text tool's defaults, the selected custom
// text layers, or the selected built-in part with wording, and writes through the same fields and TextPatch helpers the Properties panel uses.
import { BACK_FONTS, FONT_CATEGORIES } from '@/lib/card-back';
import { loadBackFont } from '@/lib/card-back-fonts';
import { newCustom, type CustomText } from '@/lib/overlay-custom';
import { type TextPatch } from '@/lib/overlay-text-style';
import { applyCustomText, applyToPatch, customTextFormat, formatOfPatch, mixedFormat, type TextFormat } from '@/lib/text-format';
import { TextOptionsBar } from '../components/workspace/TextOptionsBar';
import { useOverlayEditor } from './OverlayEditorContext';

/** The built-in parts with wording, and the settings behind their font, size, colour and style. The wording layers of a pack opening, the show-off and the collection. */
export const BUILTIN_TEXT: Record<string, { font: string; size?: string; color?: string; style: string }> = {
  label: { font: 'reveal.labelFont', size: 'reveal.labelSize', style: 'reveal.labelStyle' },
  got: { font: 'reveal.gotFont', color: 'reveal.gotTextColor', style: 'reveal.gotStyle' },
  showlabel: { font: 'show.labelFont', size: 'show.labelSize', color: 'show.labelTextColor', style: 'show.labelStyle' },
  heading: { font: 'collection.headingFont', style: 'collection.headingStyle' },
};
const isPatch = (v: unknown): v is TextPatch => !!v && typeof v === 'object' && !Array.isArray(v);
const INHERIT = [{ id: 'inherit', label: 'Overlay font', css: 'inherit', category: 'Site' }];

/** What the text row is editing: the Text tool's defaults, custom text layers (one or several), one built-in part, or nothing. */
export function useTextBar() {
  const { activeTool, isPack, selection, layout } = useOverlayEditor();
  const customs = selection.map(id => (['pack', 'collection'] as const).flatMap(view => (layout[view].custom ?? []).filter(l => `custom:${l.id}` === id))[0]);
  const texts = !isPack && selection.length > 0 && customs.every((l): l is CustomText => l?.kind === 'text') ? (customs as CustomText[]) : null;
  const part = selection.length === 1 ? BUILTIN_TEXT[selection[0]] : undefined;
  if (texts) return { kind: 'custom' as const, texts };
  if (part && !(isPack && selection[0] === 'heading')) return { kind: 'builtin' as const, part };
  return activeTool === 'text' && !isPack ? { kind: 'tool' as const } : null;
}

export function EditorTextOptions() {
  const bar = useTextBar();
  const { layout, setLayoutVals, textTemplate, setTextTemplate, valueOf, current, globalVals, scope, setValue, previewProp } = useOverlayEditor();
  if (!bar) return null;
  const common = { fonts: BACK_FONTS, categories: FONT_CATEGORIES, onNeedFont: (f: string) => { void loadBackFont(f, 700); } };

  if (bar.kind === 'builtin') {
    const { part } = bar;
    const own = (isPatch(current[part.style]) ? current[part.style] : {}) as TextPatch;
    const inherited = (scope !== 'global' && isPatch(globalVals[part.style]) ? globalVals[part.style] : {}) as TextPatch;
    const value = {
      font: String(valueOf(part.font)),
      ...(part.size ? { size: Number(valueOf(part.size)) } : {}),
      ...(part.color ? { color: String(valueOf(part.color)) } : {}),
      ...formatOfPatch(inherited, own),
    };
    return (
      <TextOptionsBar
        {...common}
        fontExtra={INHERIT}
        value={value}
        sizeMin={10}
        sizeMax={40}
        onPreviewFont={id => previewProp(part.font, id)}
        onChange={p => {
          if (p.font !== undefined) setValue(part.font, p.font);
          if (p.size !== undefined && part.size) setValue(part.size, p.size);
          if (p.color !== undefined && part.color) setValue(part.color, p.color);
          const { font, size, color, ...style } = p; // eslint-disable-line @typescript-eslint/no-unused-vars
          if (Object.keys(style).length) setValue(part.style, applyToPatch(inherited, own, style));
        }}
      />
    );
  }

  if (bar.kind === 'tool') {
    const base = { ...(newCustom('text', [], layout.width, layout.height) as CustomText), ...textTemplate };
    return <TextOptionsBar {...common} fontExtra={INHERIT} value={customTextFormat(base)} onChange={p => { const n = applyCustomText(base, p); setTextTemplate({ font: n.font, size: n.size, color: n.color, valign: n.valign, style: n.style }); }} />;
  }

  const ids = new Set(bar.texts.map(l => l.id));
  return (
    <TextOptionsBar
      {...common}
      fontExtra={INHERIT}
      value={mixedFormat(bar.texts.map(customTextFormat))}
      sample={bar.texts.length === 1 ? bar.texts[0].text : undefined}
      onChange={p => setLayoutVals(l => {
        const next = { ...l };
        for (const view of ['pack', 'collection'] as const) {
          if (l[view].custom?.some(c => ids.has(c.id))) next[view] = { ...l[view], custom: l[view].custom!.map(c => (ids.has(c.id) && c.kind === 'text' ? applyCustomText(c, p) : c)) };
        }
        return next;
      }, bar.texts.length === 1 ? `Custom layer "${bar.texts[0].name}"` : `${bar.texts.length} text layers`)}
    />
  );
}
