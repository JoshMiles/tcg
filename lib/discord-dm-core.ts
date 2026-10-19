import { PUSH_KINDS, pushGroup, payloadFor, type PushKind } from './push-core';
import type { Notice } from './trade-notice-core';

// Discord DM alerts, the client-safe half: stored record, types and message formatting.
// OAuth, API calls and sending live in lib/discord-user.ts (Node only).

export type DiscordDmStatus = 'ok' | 'closed';

export interface DiscordLink {
  id: string;
  username: string;
  discriminator?: string;
  avatar?: string | null;
  linkedAt: number;
  dmStatus?: DiscordDmStatus;
  kinds: PushKind[];
}

/** What the settings page and API see: client-safe representation. */
export interface DiscordLinkView {
  id: string;
  username: string;
  avatar?: string | null;
  linkedAt: number;
  dmStatus: DiscordDmStatus;
  kinds: PushKind[];
}

export const DISCORD_DM_KINDS = PUSH_KINDS;
export const DISCORD_DEFAULT_KINDS: PushKind[] = ['offers', 'results'];

export function toDiscordLinkView(link: DiscordLink): DiscordLinkView {
  return {
    id: link.id,
    username: link.username,
    avatar: link.avatar ?? null,
    linkedAt: link.linkedAt,
    dmStatus: link.dmStatus === 'closed' ? 'closed' : 'ok',
    kinds: link.kinds,
  };
}

export function sanitizeDiscordKinds(raw: unknown): PushKind[] {
  if (!Array.isArray(raw)) return [...DISCORD_DEFAULT_KINDS];
  const list = DISCORD_DM_KINDS.filter(k => raw.includes(k));
  return list.length ? list : [];
}

export function sanitizeDiscordLink(raw: unknown): DiscordLink | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim() : '';
  const username = typeof o.username === 'string' ? o.username.trim() : '';
  if (!id || !username) return null;
  return {
    id,
    username,
    discriminator: typeof o.discriminator === 'string' ? o.discriminator : undefined,
    avatar: typeof o.avatar === 'string' ? o.avatar : null,
    linkedAt: typeof o.linkedAt === 'number' ? o.linkedAt : Date.now(),
    dmStatus: o.dmStatus === 'closed' ? 'closed' : 'ok',
    kinds: sanitizeDiscordKinds(o.kinds),
  };
}

/** Does this linked Discord account want a DM for this kind of notice? */
export function discordWants(link: DiscordLink | null, kind: string): boolean {
  if (!link || link.dmStatus === 'closed') return false;
  return link.kinds.includes(pushGroup(kind));
}

export interface DiscordEmbed {
  title: string;
  description: string;
  url: string;
  color: number;
  footer: { text: string };
  timestamp?: string;
}

export interface DiscordDmPayload {
  embeds: DiscordEmbed[];
}

export function buildDiscordDmPayload(notice: Pick<Notice, 'id' | 'kind' | 'text' | 'tradeId' | 'feedbackId'>, siteUrl: string): DiscordDmPayload {
  const p = payloadFor(notice);
  const targetUrl = p.url.startsWith('http') ? p.url : `${siteUrl.replace(/\/+$/, '')}${p.url}`;
  return {
    embeds: [
      {
        title: p.title,
        description: p.body,
        url: targetUrl,
        color: 0xeab308, // Cheesy yellow (#eab308)
        footer: { text: 'The Cheesy TCG' },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}
