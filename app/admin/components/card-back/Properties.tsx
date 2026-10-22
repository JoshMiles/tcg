'use client';
import { useRef } from 'react';
import { ImageUploadField } from '../image-upload';
import { MarkupButtons } from '../MarkupButtons';
import { PRINT_W } from './Canvas';
import { FontPicker } from '../workspace/FontPicker';
import { loadBackFont } from '@/lib/card-back-fonts';
import { BACK_FONTS, FONT_CATEGORIES, KIND_LABELS, MAX_TEXT, type BackEl, type CardBackStyle } from '@/lib/card-back';
import { DEFAULT_MIN_SIZE, SIZE_PRESETS, pctToPt, ptToPct } from '@/lib/text-style';
import { BLENDS, PATTERN_IDS, PATTERN_LABELS } from '@/lib/card-back-patterns';
import { plateBackground } from '@/lib/card-back-v1';
import { AlignRow, Check, CharacterFields, Colour, EffectFields, Group, Num, OpacityRow, Row, chip, field } from '../workspace/CharacterPanel';
import { makeFree, patchBackground, patchElements, resetElement, returnToStack, type Box } from '@/lib/card-back-edit';

/** Size in pt as if printed on a 2.5 in card (stored as % of the card width): a number (arrows 0.5, Shift 5), a slider and presets. */
function SizeField({ value, onChange }: { value: number; onChange: (pct: number) => void }) {
  const pt = pctToPt(value);
  const setPt = (n: number) => onChange(ptToPct(Math.min(54, Math.max(3.6, n))));
  return (
    <>
      <Row label="Size (pt)">
        <span className="flex items-center gap-2">
          <input type="number" aria-label="Size (pt)" className={`${field} w-20!`} min={4} max={54} step={0.5} value={pt}
            onKeyDown={ev => { if (ev.shiftKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) { ev.preventDefault(); setPt(pt + (ev.key === 'ArrowUp' ? 5 : -5)); } }}
            onChange={ev => { const n = Number(ev.target.value); if (ev.target.value.trim() !== '' && Number.isFinite(n)) setPt(n); }} />
          <input type="range" aria-label="Size slider" className="range range-xs flex-1" min={4} max={54} step={0.5} value={pt} onChange={ev => setPt(Number(ev.target.value))} />
        </span>
      </Row>
      <div className="flex flex-wrap gap-1 pl-[5.5rem]">
        {SIZE_PRESETS.map(([l, n]) => <button key={l} type="button" aria-pressed={pt === n} title={`${n} pt`} onClick={() => setPt(n)} className={chip(pt === n)}>{l}</button>)}
      </div>
    </>
  );
}

/** The properties of the selection: the element's placement, type, content and effects, or the background when nothing (or the background) is selected. */
export function Properties({ style, selection, boxes, cardW, onChange, onPreview }: {
  style: CardBackStyle;
  selection: Set<string>;
  boxes: Record<string, Box & { fontPx: number }>;
  cardW: number;
  onChange: (next: CardBackStyle, key?: string) => void;
  /** Shows a style on the canvas without changing the design (the font picker's hover); null restores. */
  onPreview?: (next: CardBackStyle | null) => void;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const ids = style.elements.filter(e => selection.has(e.id)).map(e => e.id);
  if (selection.has('bg') || ids.length === 0) return <BackgroundPanel style={style} onChange={onChange} />;
  const els = style.elements.filter(e => ids.includes(e.id));
  const e = els[0];
  const many = els.length > 1;
  const set = (patch: Partial<BackEl>, key?: string) => onChange(patchElements(style, ids, patch), key ? `${ids.join()}:${key}` : undefined);
  const text = e.kind !== 'qr' && e.kind !== 'logo';
  // Light markup (**bold**, *italic*, {color:#rrggbb}..{/color}): wrap the selection, or put the caret between the marks.
  const wrapText = (open: string, close: string) => {
    const el = textRef.current, a = el?.selectionStart ?? e.text.length, b = el?.selectionEnd ?? a;
    const next = e.text.slice(0, a) + open + e.text.slice(a, b) + close + e.text.slice(b);
    if (next.length > MAX_TEXT) return;
    set({ text: next }, 'text');
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + open.length, b + open.length); });
  };
  const free = els.every(x => x.place === 'free');
  const toFree = () => { let s = style; for (const x of els) { const b = boxes[x.id]; if (b && x.place === 'stack') s = makeFree(s, x.id, b, b.fontPx, PRINT_W); } onChange(s); };

  return (
    <div>
      <p className="text-sm font-semibold text-white mb-2">{many ? `${els.length} elements` : e.kind === 'text' ? 'Text box' : KIND_LABELS[e.kind]}</p>

      <Group title="Layer">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={chip(!free)} onClick={() => onChange(els.reduce((s, x) => returnToStack(s, x.id), style))}>In the stack</button>
          <button type="button" className={chip(free)} onClick={toFree}>Placed freely</button>
        </div>
        {free ? (
          <>
            <Num label="x (%)" value={e.x} min={0} max={100} step={0.5} onChange={v => set({ x: v }, 'x')} />
            <Num label="y (%)" value={e.y} min={0} max={100} step={0.5} onChange={v => set({ y: v }, 'y')} />
            <Num label="Width (%)" value={e.w} min={10} max={100} step={1} onChange={v => set({ w: v }, 'w')} />
            {text && <Row label="Height">
              <span className="flex items-center gap-2">
                <Check label="Fixed" on={e.h !== undefined} onChange={v => set({ h: v ? Math.round((boxes[e.id]?.h ?? 10) * 2) / 2 : undefined })} />
                {e.h !== undefined && <input type="number" aria-label="Height (%)" className={`${field} w-20!`} min={2} max={100} step={0.5} value={Math.round(e.h * 100) / 100} onChange={ev => { const n = Number(ev.target.value); if (ev.target.value.trim() !== '' && Number.isFinite(n)) set({ h: n }, 'h'); }} />}
              </span>
            </Row>}
            <Num label="Rotate" value={e.rotate} min={-45} max={45} step={1} onChange={v => set({ rotate: v }, 'rot')} />
            {text && <OpacityRow value={e} onChange={set} />}
          </>
        ) : <p className="text-xs text-gray-500">In the stack the element sits in the classic centred column, in list order. Its face stays the classic one until you pick a font. Place it freely to move it, rotate it and set the rest of its type.</p>}
        <Check label="Locked (the canvas can't drag it)" on={e.locked} onChange={v => set({ locked: v })} />
      </Group>

      {text && (
        <Group title="Font">
          <Row label="Font">
            <FontPicker
              fonts={BACK_FONTS}
              categories={FONT_CATEGORIES}
              value={e.font}
              sample={e.kind === 'text' ? e.text : ''}
              onChange={id => set({ font: id })}
              onNeedFont={id => { void loadBackFont(id, 400); }}
              onPreview={id => onPreview?.(id ? patchElements(style, ids, { font: id }) : null)}
            />
          </Row>
          {free ? (
            <>
              <SizeField value={e.size} onChange={v => set({ size: v }, 'size')} />
              <Row label="Auto-fit">
                <span className="flex gap-1">
                  {([[undefined, 'Off'], ['shrink', 'Shrink to fit the box'], ['width', 'Fit width']] as const).map(([m, l]) => (
                    <button key={l} type="button" disabled={!!e.arc} aria-pressed={e.fit === m} onClick={() => set(m ? { fit: m, minSize: e.minSize ?? DEFAULT_MIN_SIZE } : { fit: undefined, minSize: undefined })} className={chip(e.fit === m)}>{l}</button>
                  ))}
                </span>
              </Row>
              <Row label="Arc" reset={e.arc ? () => set({ arc: undefined }) : undefined}>
                <span className="flex items-center gap-2 w-full">
                  <input type="range" aria-label="Arc slider" className="range range-xs flex-1" min={-100} max={100} step={1} value={e.arc ?? 0} onChange={ev => set({ arc: Number(ev.target.value) || undefined }, 'arc')} />
                  <input type="number" aria-label="Arc" className={`${field} w-16!`} min={-100} max={100} step={1} value={e.arc ?? 0} onChange={ev => { const n = Number(ev.target.value); if (ev.target.value.trim() !== '' && Number.isFinite(n)) set({ arc: Math.round(Math.min(100, Math.max(-100, n))) || undefined }, 'arc'); }} />
                </span>
              </Row>
              {e.arc ? <p className="text-[11px] text-gray-500">An arc is one line of text: wrapping, line limits, box height, auto-fit and justify are ignored, and the plate and inner shadow are not drawn.</p> : null}
              {e.fit && !e.arc && <Num label="Min size (pt)" value={pctToPt(e.minSize ?? DEFAULT_MIN_SIZE)} min={1.8} max={54} step={0.5} onChange={v => set({ minSize: ptToPct(v) }, 'min')} />}
            </>
          ) : (
            <Row label="Size"><span className="flex gap-1">{([['S', 0.8], ['M', 1], ['L', 1.25]] as const).map(([k, v]) => <button key={k} type="button" aria-pressed={e.scale === v} onClick={() => set({ scale: v })} className={chip(e.scale === v)}>{k}</button>)}</span></Row>
          )}
          <Colour label="Colour" value={e.color} named={['auto', 'rarity']} onChange={v => set({ color: v }, 'color')} />
          {free && <CharacterFields value={e} onChange={set} />}
        </Group>
      )}

      {text && free && (
        <Group title="Paragraph">
          <AlignRow value={e} onChange={set} />
          <Num label="Indent (em)" value={e.indent ?? 0} min={0} max={5} step={0.25} onChange={v => set({ indent: v || undefined }, 'ind')} />
          <Num label="Paragraph gap" value={e.paraGap ?? 0} min={0} max={3} step={0.1} onChange={v => set({ paraGap: v || undefined }, 'pg')} />
          <Row label="Box">
            <span className="flex flex-wrap items-center gap-2">
              <Check label="Wrap" on={e.wrap !== false} onChange={v => set({ wrap: v ? undefined : false })} />
              {e.h !== undefined && (['top', 'middle', 'bottom'] as const).map(a => <button key={a} type="button" aria-pressed={(e.valign ?? 'top') === a} onClick={() => set({ valign: a === 'top' ? undefined : a })} className={chip((e.valign ?? 'top') === a)}>{a}</button>)}
            </span>
          </Row>
          <Num label="Max lines (0 = any)" value={e.maxLines ?? 0} min={0} max={20} step={1} onChange={v => set({ maxLines: v >= 1 ? Math.round(v) : undefined }, 'ml')} />
          <Num label="Padding (%)" value={e.pad ?? 0} min={0} max={15} step={0.5} onChange={v => set({ pad: v || undefined }, 'pad')} />
        </Group>
      )}

      <Group title="Effects">
        <EffectFields value={e} onChange={set} text={text} free={free} />
      </Group>

      {!many && (e.kind === 'text' || e.kind === 'logo' || e.kind === 'qr') && (
        <Group title="Content">
          {e.kind === 'text' && (
            <label className="block text-xs text-gray-400">Text <span className="text-gray-600">({e.text.length}/{MAX_TEXT}) {'{pack} {season} {card} {version} {edition} {printNumber} {holder} {date}'}</span>
              <textarea ref={textRef} aria-label="Text" className="textarea w-full mt-1" rows={3} maxLength={MAX_TEXT} value={e.text} onChange={ev => set({ text: ev.target.value }, 'text')} />
            </label>
          )}
          {e.kind === 'text' && <MarkupButtons wrap={wrapText} />}
          {e.kind === 'logo' && (
            <>
              <Row label="Image"><span className="flex gap-1">{(['cover', 'url'] as const).map(s => <button key={s} type="button" aria-pressed={e.src === s} onClick={() => set({ src: s })} className={chip(e.src === s)}>{s === 'cover' ? 'Pack cover' : 'Uploaded'}</button>)}</span></Row>
              {e.src === 'url' && <ImageUploadField name="cardBackLogo" label="Logo image" defaultValue={e.url} onUrlChange={u => set({ url: u, src: 'url' })} />}
              <Num label="Size (px)" value={e.px} min={10} max={120} step={2} onChange={v => set({ px: v }, 'px')} />
            </>
          )}
          {e.kind === 'qr' && (<><Colour label="Dark" value={e.dark} named={['auto']} onChange={v => set({ dark: v })} /><Colour label="Light" value={e.light} named={['auto']} onChange={v => set({ light: v })} /></>)}
        </Group>
      )}

      <button type="button" onClick={() => onChange(els.reduce((s, x) => resetElement(s, x.id), style))} className="text-xs font-bold text-gray-400 hover:text-white">Reset {many ? 'elements' : 'element'}</button>
    </div>
  );
}

function BackgroundPanel({ style, onChange }: { style: CardBackStyle; onChange: (next: CardBackStyle, key?: string) => void }) {
  const set = (patch: Parameters<typeof patchBackground>[1], key?: string) => onChange(patchBackground(style, patch), key);
  return (
    <div>
      <p className="text-sm font-semibold text-white mb-2">Background</p>
      <Group title="Plate">
        <div className="flex flex-wrap gap-1.5">{(['steel', 'solid', 'gradient'] as const).map(b => <button key={b} type="button" aria-pressed={style.background === b} onClick={() => set({ background: b })} className={chip(style.background === b)}>{b === 'steel' ? 'Brushed steel' : b === 'solid' ? 'One colour' : 'Gradient'}</button>)}</div>
        {style.background !== 'steel' && <Colour label={style.background === 'gradient' ? 'From' : 'Colour'} value={style.bg1} onChange={v => set({ bg1: v }, 'bg1')} />}
        {style.background === 'gradient' && <><Colour label="To" value={style.bg2} onChange={v => set({ bg2: v }, 'bg2')} /><Num label="Angle" value={style.angle} min={0} max={359} step={5} onChange={v => set({ angle: v }, 'ang')} /></>}
        <Colour label="Edge" value={style.edge} named={['rarity']} onChange={v => set({ edge: v }, 'edge')} />
        <Row label="Stack at"><span className="flex gap-1">{(['top', 'middle', 'bottom'] as const).map(a => <button key={a} type="button" aria-pressed={style.align === a} onClick={() => set({ align: a })} className={chip(style.align === a)}>{a}</button>)}</span></Row>
      </Group>
      <Group title="Pattern">
        <div role="group" aria-label="Pattern" className="grid grid-cols-5 gap-1.5">
          {PATTERN_IDS.map(id => (
            <button key={id} type="button" aria-pressed={style.pattern === id} aria-label={PATTERN_LABELS[id]} title={PATTERN_LABELS[id]} onClick={() => set({ pattern: id })}
              className={`h-14 rounded-md border overflow-hidden text-[9px] font-bold ${style.pattern === id ? 'border-yellow-400 ring-1 ring-yellow-400' : 'border-gray-700'}`}
              style={{ background: plateBackground({ background: 'steel', bg1: '#a9a9b3', bg2: '#dcdce3', angle: 135, pattern: id, cover: style.cover, patternColor: 'auto', patternOpacity: 1, patternScale: 1.4, patternAngle: 0 }) }}>
              <span className="bg-black/50 text-white px-0.5 rounded-sm">{id === 'none' ? 'none' : ''}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">{PATTERN_LABELS[style.pattern]}</p>
        {style.pattern !== 'none' && style.pattern !== 'cover' && (
          <>
            <Colour label="Colour" value={style.patternColor} named={['auto']} onChange={v => set({ patternColor: v }, 'pc')} />
            <Num label="Opacity" value={style.patternOpacity} min={0} max={1} step={0.05} onChange={v => set({ patternOpacity: v }, 'po')} />
            <Num label="Scale" value={style.patternScale} min={0.5} max={3} step={0.1} onChange={v => set({ patternScale: v }, 'ps')} />
            <Num label="Angle" value={style.patternAngle} min={0} max={359} step={5} onChange={v => set({ patternAngle: v }, 'pa')} />
          </>
        )}
        {style.pattern !== 'none' && <Row label="Blend"><span className="flex flex-wrap gap-1">{BLENDS.map(b => <button key={b} type="button" aria-pressed={style.patternBlend === b} onClick={() => set({ patternBlend: b })} className={chip(style.patternBlend === b)}>{b}</button>)}</span></Row>}
      </Group>
    </div>
  );
}
