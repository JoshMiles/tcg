// The pack's designed back as the OBS overlay draws it (ROADMAP 20.3c). widget.js is plain JavaScript and cannot import layoutBack, so
// GET /api/overlay/config sends each pack's nodes already laid out, at one reference card size; the widget draws them as DOM (the same
// classes and rules as FlipCard, scoped under .tcg-back in widget.css) and scales the whole plate to the card. Pure and client-safe.
import { BACK_FONTS, DEFAULT_CARD_BACK, nearestWeight, plateVars, type BackEl, type CardBackStyle } from './card-back';
import { fontsNeeded, layoutBack, type BackNode } from './card-back-layout';
import { flipBackFor } from './flip-back';

/** The card size the nodes are laid out at; the widget scales the plate to the real card. */
export const OVERLAY_BACK_REF = { w: 240, h: 360 } as const;
/** Colour used where the design follows the card's rarity: the print's rarity is not known when the pack's back is prepared. */
export const OVERLAY_RARITY = '#9ca3af';

/** Elements that print facts about one copy. The overlay flips before the print is known, so they are hidden; logo, brand, text boxes and the pattern stay. */
export const OVERLAY_HIDDEN_KINDS: readonly BackEl['kind'][] = ['number', 'edition', 'name', 'date', 'origin', 'history', 'qr', 'link'];

export interface OverlayBack {
  w: number;
  h: number;
  /** The plate's CSS variables (edge, background, position). */
  vars: Record<string, string>;
  nodes: BackNode[];
  /** Files for the curated fonts the nodes use. */
  fonts: { family: string; weight: number; file: string; italic?: true }[];
}

/** Every card-back face, for overlay text. A file is the 700 cut when one exists, else the only cut. Site faces have no file. */
export function overlayFontCatalog(): { id: string; css: string; family?: string; weight?: number; file?: string }[] {
  return BACK_FONTS.map(f => {
    if (!f.files) return { id: f.id, css: f.css };
    const family = /'([^']+)'/.exec(f.css)?.[1];
    const weights = Object.keys(f.files).map(Number);
    const weight = weights.includes(700) ? 700 : weights[0];
    return { id: f.id, css: f.css, family, weight, file: f.files[weight] };
  });
}

export function overlayBack(style: CardBackStyle = DEFAULT_CARD_BACK): OverlayBack {
  const shown: CardBackStyle = { ...style, elements: style.elements.map(e => (OVERLAY_HIDDEN_KINDS.includes(e.kind) ? { ...e, show: false } : e)) };
  const print = flipBackFor({ n: 0, variant: 'regular', name: '', hex: OVERLAY_RARITY });
  const nodes = layoutBack(shown, print, { ...OVERLAY_BACK_REF });
  const fonts = fontsNeeded(nodes).flatMap(f => {
    const def = BACK_FONTS.find(x => x.id === f.id);
    const family = def && /'([^']+)'/.exec(def.css)?.[1];
    if (!def?.files || !family) return [];
    const weight = nearestWeight(def, f.weight);
    if (f.italic && def.italicFile) return [{ family, weight, file: def.italicFile, italic: true as const }];
    return [{ family, weight, file: def.files[weight] }];
  });
  return { ...OVERLAY_BACK_REF, vars: plateVars(shown, OVERLAY_RARITY), nodes, fonts };
}
