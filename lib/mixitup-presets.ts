import { incomingSetup } from './mixitup-setup';

// Mix It Up command files (.miucommand, ROADMAP 55.5). One JSON object written the way Json.NET writes it: `$type` first on every
// object and the keys in the order of scripts/fixtures/mixitup-chat-command.miucommand (a real export). Pure; each call makes new IDs.
// Event and Stream Deck (action group) files follow the same layout; their model classes are in github.com/MixItUpBot/Desktop.

const T = (n: string) => `MixItUp.Base.Model.${n}, MixItUp.Base`;
const DICT = 'System.Collections.Generic.Dictionary`2[[System.String, System.Private.CoreLib],[System.String, System.Private.CoreLib]], System.Private.CoreLib';
const uuid = () => globalThis.crypto.randomUUID();

/** The Requirements of the sample: everyone may run it, no cost, no cooldown. */
const requirements = () => ({
  $type: T('Requirements.RequirementsSetModel'),
  Requirements: [
    { $type: T('Requirements.RoleRequirementModel'), StreamingPlatform: 99999, UserRole: 100, UserRoleList: [], SubscriberTier: 1, YouTubeMembershipLevelID: null, PatreonBenefitID: '' },
    { $type: T('Requirements.ArgumentsRequirementModel'), Items: [], AssignToSpecialIdentifiers: false },
    { $type: T('Requirements.ThresholdRequirementModel'), Amount: 0, TimeSpan: 0, RunForEachUser: false },
    { $type: T('Requirements.SettingsRequirementModel'), DeleteChatMessageWhenRun: false, DontDeleteChatMessageWhenRun: false, ShowOnChatContextMenu: false },
  ],
});

/** The special identifier a reply key becomes: `message` is $reply, `left` is $tcgleft (Mix It Up has its own $message). */
export const identifierFor = (key: string) => (key === 'message' ? 'reply' : `tcg${key.toLowerCase().replace(/[^a-z0-9]/g, '')}`);

interface Parts { name: string; url: string; body: string; replyKeys?: string[]; chatText?: string }

function file(head: Record<string, unknown>, p: Parts, type: number, triggers: string[]): string {
  const keys = p.replyKeys ?? [];
  const actions: unknown[] = [{
    $type: T('Actions.WebRequestActionModel'), Url: p.url, ResponseType: 1,
    JSONToSpecialIdentifiers: { $type: DICT, ...Object.fromEntries(keys.map(k => [k, identifierFor(k)])) },
    HttpMethod: 1, CustomHeaders: { $type: DICT }, RequestBody: p.body, ID: uuid(), Name: 'Web Request', Type: 11, Enabled: true,
  }];
  if (p.chatText) actions.push({ $type: T('Actions.ChatActionModel'), ChatText: p.chatText, SendAsStreamer: false, IsWhisper: false, WhisperUserName: null, ID: uuid(), Name: 'Chat Message', Type: 1, Enabled: true });
  return JSON.stringify({
    ...head, ID: uuid(), Name: p.name, Type: type, IsEnabled: true, Unlocked: false, IsEmbedded: false, GroupName: null,
    Triggers: triggers, Requirements: requirements(), Actions: actions,
  });
}

/** A chat command: the Web Request posts `body` to `url`, then a Chat Message says the answer's `message`. */
export function chatCommandFile(p: Parts & { aliases?: string[] }): string {
  return file({ $type: T('Commands.ChatCommandModel'), IncludeExclamation: true, Wildcards: false }, p, 1, [p.name, ...(p.aliases ?? [])]);
}

/** CommandTypeEnum.Event = 2. EventTypeEnum: TwitchChannelStreamStart 200, TwitchChannelStreamStop 201 (the game runs on Twitch only). */
export function eventCommandFile(p: Parts & { eventType: number }): string {
  return file({ $type: T('Commands.EventCommandModel'), EventType: p.eventType }, p, 2, []);
}

/** CommandTypeEnum.ActionGroup = 4: what a Stream Deck button runs. */
export function actionGroupFile(p: Parts): string {
  return file({ $type: T('Commands.ActionGroupCommandModel'), RunOneRandomly: false }, p, 4, []);
}

// ---- the download link: a card describes its command, the staff-only route fills in the secret and address ----

export interface PresetSpec {
  kind: 'chat' | 'event' | 'group';
  /** The command's name (chat: without the !). */
  name: string;
  /** Which incoming webhook, without /api/webhooks/. */
  path: 'pull' | 'command' | 'buff' | 'stream';
  /** The body fields besides the secret, as the card shows them. */
  fields: Record<string, string>;
  /** The answer's fields to keep as special identifiers (default none). */
  reply?: string[];
  aliases?: string[];
  /** Event files only. */
  event?: 'live' | 'offline';
}

const EVENT_TYPES = { live: 200, offline: 201 };
const PATHS = ['pull', 'command', 'buff', 'stream'];

export const presetHref = (s: PresetSpec) => `/api/admin/mixitup/preset?${new URLSearchParams({ spec: JSON.stringify(s) })}`;

/** Reads a link's spec and makes the file; null when the spec is not one this site offers. */
export function presetFile(specJson: string | null, siteUrl: string, secret: string): { filename: string; text: string } | null {
  let s: PresetSpec;
  try { s = JSON.parse(specJson ?? ''); } catch { return null; }
  const strings = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === 'string' && x.length <= 40);
  if (!s || !['chat', 'event', 'group'].includes(s.kind) || typeof s.name !== 'string' || !s.name.trim() || s.name.length > 60) return null;
  if (!PATHS.includes(s.path) || !s.fields || typeof s.fields !== 'object' || !Object.values(s.fields).every(v => typeof v === 'string')) return null;
  if ((s.reply && !strings(s.reply)) || (s.aliases && !strings(s.aliases))) return null;
  if (s.kind === 'event' && !(s.event && s.event in EVENT_TYPES)) return null;
  const { url, body } = incomingSetup(`${siteUrl}/api/webhooks/${s.path}`, secret, s.fields);
  const parts = { name: s.name.trim(), url, body, replyKeys: s.reply, chatText: s.reply?.includes('message') ? `$${identifierFor('message')}` : undefined };
  const text = s.kind === 'chat' ? chatCommandFile({ ...parts, aliases: s.aliases })
    : s.kind === 'event' ? eventCommandFile({ ...parts, eventType: EVENT_TYPES[s.event!] }) : actionGroupFile(parts);
  return { filename: `${s.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'command'}.miucommand`, text };
}
