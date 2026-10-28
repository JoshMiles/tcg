import { sanitizeFx, clamp, hex, isRec, pick, r2, type Effects } from './text-style';
import { sanitizeTextPatch, type TextPatch } from './overlay-text-style';
import { ARROWS, IMAGE_FITS, LINE_CAPS, SHAPES, STROKE_POS, isSafeImageUrl, sanitizeFill, sanitizeShape, type ShapeFill, type ShapeSpec, type ShapeType } from './shapes';

// The shape and image types live in lib/shapes.ts (the card back shares them); re-exported so every overlay import keeps working.
export { ARROWS, IMAGE_FITS, LINE_CAPS, SHAPES, STROKE_POS, isSafeImageUrl, sanitizeFill, sanitizeShape };
export type { ShapeFill, ShapeSpec, ShapeType };

// Layers the admin adds to the overlay themselves (ROADMAP 38.7): text, image and shape, stored per view in the layout as `custom`.
// Pure and client-safe. public/widget.js (renderCustom) draws them; every value here is data, never markup.

export const MAX_CUSTOM = 16;
export const CUSTOM_KINDS = ['text', 'image', 'shape', 'goal'] as const;
export type CustomKind = (typeof CUSTOM_KINDS)[number];
export const BANDS = ['front', 'back'] as const;
/** Pack view only: when in the pull the layer is up (`reveal`: until the card is revealed, `after`: from the card reveal on). */
export const SHOWS = ['always', 'reveal', 'after'] as const;
export const MAX_CUSTOM_TEXT = 300;
export const VALIGNS = ['top', 'middle', 'bottom'] as const;

interface CustomBase {
  id: string; name: string;
  /** The box on the stage in design px (top left), plus turn in degrees. */
  x: number; y: number; w: number; h: number; rotate: number;
  opacity: number; visible: boolean;
  /** Behind the whole card theater or in front of it; order inside a band is the list order (last is on top). */
  band: (typeof BANDS)[number];
  show: (typeof SHOWS)[number];
  /** Fade in when it comes up, out when its `show` window ends (ms, 0 = cut). */
  fadeIn: number; fadeOut: number;
}
export interface CustomText extends CustomBase {
  kind: 'text';
  /** Wording: tokens and light markup, as every wording field. */
  text: string;
  style: TextPatch;
  /** Font size in design px. */
  size: number; color: string;
  /** A font id from the card back list, or `inherit` (the overlay font). */
  font: string;
  /** Where the words sit in the box. */
  valign: (typeof VALIGNS)[number];
}
export interface CustomImage extends CustomBase {
  kind: 'image'; url: string; fit: (typeof IMAGE_FITS)[number];
  /** Corner radius in design px. */
  radius: number;
  /** Only `shadows`, `glow` and `stroke` are drawn on an image. */
  fx: Effects;
}
export interface CustomShape extends CustomBase, ShapeSpec {
  kind: 'shape';
  /** Only `shadows` and `glow` are drawn on a shape. */
  fx: Effects;
}
/** The community pack goal's progress bar (ROADMAP 57.5). It draws nothing until a goal is set for the stream; the numbers come from the site. */
export interface CustomGoal extends CustomBase {
  kind: 'goal';
  /** The filled part and the empty track behind it. */
  color: string; track: string;
  /** The words ("Pack goal: 37 / 50") over the bar, when `showText` is on: size in design px and colour. */
  showText: boolean; size: number; textColor: string;
}
export type CustomLayer = CustomText | CustomImage | CustomShape | CustomGoal;

const KIND_LABEL: Record<CustomKind, string> = { text: 'Text', image: 'Image', shape: 'Shape', goal: 'Pack goal' };
const ID = /^[A-Za-z0-9_-]{1,24}$/;

/** Valid layers from anything: unknown kinds, bad ids and duplicates are dropped, at most MAX_CUSTOM kept. Absent or empty gives []. */
export function sanitizeCustom(raw: unknown, width: number, height: number, view: 'pack' | 'collection' = 'pack'): CustomLayer[] {
  const out: CustomLayer[] = [];
  const seen = new Set<string>();
  for (const r of Array.isArray(raw) ? raw : []) {
    if (out.length >= MAX_CUSTOM) break;
    if (!isRec(r) || typeof r.id !== 'string' || !ID.test(r.id) || seen.has(r.id)) continue;
    const kind = pick(r.kind, CUSTOM_KINDS, undefined as unknown as CustomKind);
    if (!kind) continue;
    const base: CustomBase = {
      id: r.id,
      name: (typeof r.name === 'string' ? r.name.trim().slice(0, 40) : '') || KIND_LABEL[kind],
      x: Math.round(clamp(r.x, -width, width * 2, 0)), y: Math.round(clamp(r.y, -height, height * 2, 0)),
      w: Math.round(clamp(r.w, 1, width * 2, 200)), h: Math.round(clamp(r.h, 1, height * 2, 100)),
      rotate: Math.round(clamp(r.rotate, -360, 360, 0)), opacity: r2(clamp(r.opacity, 0, 1, 1)), visible: r.visible !== false,
      band: pick(r.band, BANDS, 'front'), show: view === 'pack' ? pick(r.show, SHOWS, 'always') : 'always', // only the pack view has a reveal
      fadeIn: Math.round(clamp(r.fadeIn, 0, 5000, 0)), fadeOut: Math.round(clamp(r.fadeOut, 0, 5000, 0)),
    };
    if (kind === 'text') {
      out.push({
        ...base, kind,
        text: typeof r.text === 'string' ? r.text.slice(0, MAX_CUSTOM_TEXT) : '',
        style: sanitizeTextPatch(r.style),
        size: Math.round(clamp(r.size, 6, 400, 32)), color: hex(r.color, '#ffffff'),
        font: typeof r.font === 'string' && /^[a-z0-9_-]{1,40}$/.test(r.font) ? r.font : 'inherit',
        valign: pick(r.valign, VALIGNS, 'top'),
      });
    } else if (kind === 'image') {
      // An empty url is a new image with nothing chosen yet (the widget draws nothing); any other url must pass the check or the layer is dropped.
      if (r.url !== '' && !isSafeImageUrl(r.url)) continue;
      const fx = sanitizeFx(r.fx), keep: Effects = {};
      if (fx.shadows) keep.shadows = fx.shadows;
      if (fx.glow) keep.glow = fx.glow;
      if (fx.stroke) keep.stroke = fx.stroke;
      out.push({ ...base, kind, url: r.url as string, fit: pick(r.fit, IMAGE_FITS, 'contain'), radius: Math.round(clamp(r.radius, 0, 1000, 0)), fx: keep });
    } else if (kind === 'goal') {
      out.push({ ...base, kind, color: hex(r.color, '#facc15'), track: hex(r.track, '#1f2937'), showText: r.showText !== false, size: Math.round(clamp(r.size, 6, 200, 24)), textColor: hex(r.textColor, '#ffffff') });
    } else {
      const fx = sanitizeFx(r.fx), keep: Effects = {};
      if (fx.shadows) keep.shadows = fx.shadows;
      if (fx.glow) keep.glow = fx.glow;
      out.push({
        ...base, kind,
        ...sanitizeShape(r),
        fx: keep,
      });
    }
    seen.add(r.id);
  }
  return out;
}

const DEFAULT_SIZE: Record<CustomKind, [number, number]> = { text: [400, 80], image: [200, 200], shape: [240, 160], goal: [400, 48] };

/** The box a tool press makes: a click gives just the point (kept on the stage so the default box fits), a drag the rectangle between the two corners (at least 20 px each way). */
export function toolBox(kind: CustomKind, x0: number, y0: number, x1: number, y1: number, width: number, height: number): { x: number; y: number; w?: number; h?: number } {
  if (Math.hypot(x1 - x0, y1 - y0) < 6) {
    const [w, h] = DEFAULT_SIZE[kind];
    return { x: Math.round(clamp(x0, 0, Math.max(0, width - w), 0)), y: Math.round(clamp(y0, 0, Math.max(0, height - h), 0)) };
  }
  return { x: Math.round(Math.min(x0, x1)), y: Math.round(Math.min(y0, y1)), w: Math.round(Math.max(20, Math.abs(x1 - x0))), h: Math.round(Math.max(20, Math.abs(y1 - y0))) };
}

const freeNumber = (kind: CustomKind, taken: string[]) => { let n = 1; while (taken.includes(`${kind}${n}`)) n++; return n; };

/** Copies of `layers` with fresh ids, each moved by `by` px; null when the view could not hold them (MAX_CUSTOM). */
function cloneInto(list: CustomLayer[], layers: CustomLayer[], by: number, name: (l: CustomLayer) => string): CustomLayer[] | null {
  if (!layers.length || list.length + layers.length > MAX_CUSTOM) return null;
  const taken = list.map(l => l.id);
  return layers.map(l => {
    const id = `${l.kind}${freeNumber(l.kind, taken)}`;
    taken.push(id);
    return { ...l, id, name: name(l).slice(0, 40), x: l.x + by, y: l.y + by };
  });
}

/** Layer `id` copied just above itself (same band), named "<name> copy" and moved 20 px; null when missing or the view is full. */
export function duplicateCustom(list: CustomLayer[], id: string): { list: CustomLayer[]; added: CustomLayer } | null {
  const i = list.findIndex(l => l.id === id);
  const [added] = (i < 0 ? null : cloneInto(list, [list[i]], 20, l => `${l.name} copy`)) ?? [];
  if (!added) return null;
  return { list: [...list.slice(0, i + 1), added, ...list.slice(i + 1)], added };
}

/** `layers` (from the editor's clipboard) pasted on top of `list` with fresh ids; moved 20 px when a layer already sits exactly there. Null when it will not fit. */
export function pasteCustom(list: CustomLayer[], layers: CustomLayer[]): { list: CustomLayer[]; added: CustomLayer[] } | null {
  const here = (l: CustomLayer) => list.some(o => o.x === l.x && o.y === l.y && o.w === l.w && o.h === l.h);
  const added = cloneInto(list, layers, layers.some(here) ? 20 : 0, l => l.name);
  return added && { list: [...list, ...added], added };
}

/** A new layer of `kind` with defaults, centred on a stage of width x height (or at `box`), with an id not in `taken`. */
export function newCustom(kind: CustomKind, taken: string[], width: number, height: number, box?: { x: number; y: number; w?: number; h?: number }): CustomLayer {
  const n = freeNumber(kind, taken);
  const [w, h] = DEFAULT_SIZE[kind];
  const at = { id: `${kind}${n}`, x: box ? box.x : Math.round((width - w) / 2), y: box ? box.y : Math.round((height - h) / 2), w: box?.w ?? w, h: box?.h ?? h };
  return sanitizeCustom([{ ...at, kind, name: `${KIND_LABEL[kind]} ${n}`, ...(kind === 'text' ? { text: 'New text' } : kind === 'image' ? { url: '' } : { fill: { type: 'solid', color: '#facc15' } }) }], width, height)[0];
}

/** Layer `id` one step towards the back (-1) or front (+1) among the layers of its own band (the other band is drawn elsewhere). */
export function stepCustom(list: CustomLayer[], id: string, dir: -1 | 1): CustomLayer[] {
  const i = list.findIndex(l => l.id === id);
  if (i < 0) return list;
  let j = i + dir;
  while (j >= 0 && j < list.length && list[j].band !== list[i].band) j += dir;
  if (j < 0 || j >= list.length) return list;
  const out = list.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Drag-reorder: `id` takes the place of `onto` (and joins its band). */
export function moveCustomOnto(list: CustomLayer[], id: string, onto: string): CustomLayer[] {
  const from = list.find(l => l.id === id), to = list.find(l => l.id === onto);
  if (!from || !to || from === to) return list;
  const out = list.filter(l => l !== from);
  out.splice(out.indexOf(to) + (list.indexOf(from) < list.indexOf(to) ? 1 : 0), 0, { ...from, band: to.band });
  return out;
}
