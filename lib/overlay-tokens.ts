// Wording tokens for the overlay's text layers. `fillTokens` is the twin of the one in public/widget.js
// (between the TOKENS markers); scripts/check-overlay.mts runs both on the same cases.
import { VARIANT_LABELS } from './variants';
import type { Variant } from './types';

export type TokenName = 'user' | 'cardName' | 'variant' | 'pack' | 'edition' | 'stars';

/** What each token stands for, for the editor's chips and help. `{username}` is an alias of `{user}` everywhere. */
export const TOKEN_INFO: Record<TokenName, { label: string; sample: string }> = {
  user: { label: 'The viewer', sample: 'cheesygidds' },
  cardName: { label: 'The card name', sample: 'Cheesy Cheese' },
  variant: { label: 'The card version', sample: 'Regular' },
  pack: { label: 'The pack name', sample: 'Starter Pack' },
  edition: { label: 'The edition number', sample: '3' },
  stars: { label: 'The star rating', sample: '5' },
};

export interface TokenCtx { user?: string; cardName?: string; variant?: Variant | string; pack?: string; edition?: number | string; stars?: number | string }

export function fillTokens(str: string, ctx: TokenCtx = {}): string {
  const v: Record<string, unknown> = {
    user: ctx.user, username: ctx.user, cardName: ctx.cardName,
    variant: ctx.variant ? (VARIANT_LABELS as Record<string, string>)[ctx.variant] || ctx.variant : '',
    pack: ctx.pack, edition: ctx.edition, stars: ctx.stars,
  };
  return String(str).replace(/\{(\w+)\}/g, (m, k: string) => (Object.prototype.hasOwnProperty.call(v, k) && v[k] !== undefined && v[k] !== null && v[k] !== '' ? String(v[k]) : m));
}

/** The editor's sample viewer and card for the live result line. */
export const SAMPLE_TOKENS: Required<TokenCtx> = { user: TOKEN_INFO.user.sample, cardName: TOKEN_INFO.cardName.sample, variant: 'regular', pack: TOKEN_INFO.pack.sample, edition: TOKEN_INFO.edition.sample, stars: TOKEN_INFO.stars.sample };
