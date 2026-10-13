import { cardThumbUrl } from './card-art';
import { editionLine, engravedDate, madeLine } from './flip-back';
import { isEscrow, type Copy } from './serials-core';
import type { ShareSpec } from './share-image';
import { VARIANT_LABELS } from './variants';

/** What the copy's share image needs besides the copy itself. */
export interface CopyShareInput {
  copy: Copy;
  cardName: string;
  seasonId: string;
  seasonName: string;
  packName: string;
  /** How many of this card and version were ever made. */
  total: number;
  /** Points multiplier of its edition number (1 = none). */
  mult: number;
  art: string;
  hex?: string;
  /** Collectors who chose a private profile are never named. */
  privateHolder: boolean;
  /** `https://host` without a trailing slash. */
  siteUrl: string;
}

/** The share image of one copy: its card above an engraved plate with the unique number, edition, date, holder and a QR code. */
export function copyShareSpec(i: CopyShareInput): ShareSpec {
  const { copy } = i;
  const label = `${copy.variant === 'regular' ? '' : `${VARIANT_LABELS[copy.variant]} `}${i.cardName}`;
  const host = i.siteUrl.replace(/^https?:\/\//, '');
  const gone = !copy.owner;
  return {
    title: label,
    subtitle: `${i.seasonName} · ${i.packName}`,
    stats: [VARIANT_LABELS[copy.variant], ...(i.mult > 1 ? [`Serial bonus ×${Math.round(i.mult * 100) / 100}`] : [])],
    cards: [{ src: i.art, thumb: cardThumbUrl(i.art), name: i.cardName, hex: i.hex }],
    plate: {
      number: `#${copy.uid ?? copy.n}`,
      edition: copy.uid ? editionLine(copy.n, i.total) : madeLine(copy.n, i.total) || `Edition #${copy.n}`,
      date: `${copy.est ? 'NUMBERED' : 'PULLED'} ${engravedDate(copy.at)}`,
      lines: [gone ? 'No longer exists' : isEscrow(copy.owner) ? 'In a trade offer' : i.privateHolder ? 'Held by a private collector' : `Held by @${copy.owner}`],
      gold: i.mult > 1,
      qrUrl: `${i.siteUrl}/copy/${encodeURIComponent(i.seasonId)}/${copy.id}`,
    },
    footer: copy.uid ? `${host}/c/${copy.uid}` : host,
  };
}
