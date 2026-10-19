import { getActivity, type ActivityEvent, type NewActivity } from './activity';
import { listFeedback } from './feedback';
import type { FeedbackItem } from './feedback-core';
import { getLatestRecap } from './twitch-live';
import { sampleRecap } from './stream-recap';
import { getLatestDigest } from './weekly-digest-store';
import { sampleDigest } from './weekly-digest';
import type { DiscordCategory } from './discord-config';
import {
  buildAdminLogMessage, buildDigestMessage, buildFeedbackMessage, buildListingMessage, buildMessage, buildRecapMessage, buildSystemMessage,
  categoryOf, type DiscordPayload,
} from './discord';

// The channel card's per-category test sends: the newest real example of the category when there is one, made-up data otherwise.
// Listings and system notices are not stored anywhere, so they are always made up.

const REAL = 'Test send, latest real example';
const FAKE = 'Test send, made-up data';

const withFooter = (msg: DiscordPayload, text: string): DiscordPayload => ({ ...msg, embeds: msg.embeds.map(e => ({ ...e, footer: { text } })) });

const fake = (detail: NewActivity & { staff?: string }): ActivityEvent => ({ seq: 0, at: Date.now(), ...detail });

const FAKE_EVENTS: Partial<Record<DiscordCategory, ActivityEvent>> = {
  pulls: fake({ type: 'pull', username: 'sample_viewer', cardNumber: 1, cardName: 'Sample Card', stars: 4, packName: 'Sample Pack', variant: 'shiny', isNew: true, copies: 1, uniqueOwned: 12, serial: 3 }),
  cards: fake({ type: 'grant', source: 'admin', username: 'sample_viewer', cardNumber: 1, cardName: 'Sample Card', stars: 3, staff: 'sample_mod' }),
  upgrades: fake({ type: 'upgrade', username: 'sample_viewer', cardNumber: 1, cardName: 'Sample Card', from: 'regular', to: 'shiny', cost: 5 }),
  trades: fake({ type: 'trade', action: 'accepted', username: 'sample_viewer', partner: 'other_viewer', kind: 'direct', give: ['Sample Card (Shiny)'], get: ['2× Other Card'], givePts: 120, getPts: 110 }),
  stream: fake({ type: 'trigger', kind: 'pull', source: 'webhook', username: 'sample_viewer' }),
  resets: fake({ type: 'reset', scope: 'season', username: 'sample_viewer', staff: 'sample_mod' }),
};

const FAKE_FEEDBACK: FeedbackItem = { id: 'sample', kind: 'idea', user: 'sample_viewer', title: 'Sample suggestion', body: 'This is a made-up suggestion to test the channel.', at: Date.now(), status: 'new' };

/** The test message for one category. */
export async function sampleMessage(category: DiscordCategory): Promise<DiscordPayload> {
  switch (category) {
    case 'recap': { const r = await getLatestRecap(); return buildRecapMessage(r ?? sampleRecap(), { footer: r ? REAL : FAKE }); }
    case 'digest': { const d = await getLatestDigest(); return buildDigestMessage(d ?? sampleDigest(), { footer: d ? REAL : FAKE }); }
    case 'feedback': { const [f] = await listFeedback().catch(() => []); return withFooter(buildFeedbackMessage(f ?? FAKE_FEEDBACK), f ? REAL : FAKE); }
    case 'listings':
      return withFooter(buildListingMessage({ id: 'sample', from: 'sample_viewer', expiresAt: Date.now() + 2 * 86_400_000, give: ['Sample Card (Shiny)'], get: ['Other Card'], givePts: 120, getPts: 90, wanted: ['3 collectors are looking for Sample Card (Shiny)'] }), FAKE);
    case 'system':
      return withFooter(buildSystemMessage({ title: 'System test', text: 'A made-up system notice: backups, data health and live status post here.', tone: 'info' }), FAKE);
    case 'shares':
      return withFooter(buildSystemMessage({ title: 'Share image', text: 'A collector posted their share image here. A real post is the picture itself. This test is only a message.', tone: 'info' }), FAKE);
    default: {
      const { events } = await getActivity({ limit: 200 }).catch(() => ({ events: [] as ActivityEvent[] }));
      const real = events.find(e => category === 'admin' ? !!e.staff : categoryOf(e) === category);
      if (real) return buildMessage(real, { footer: REAL, showStaff: category === 'admin' });
      if (category === 'admin') return withFooter(buildAdminLogMessage({ action: 'Sample staff action', subject: 'sample_viewer', detail: 'Made-up entry to test the channel.', by: 'sample_mod' }), FAKE);
      return buildMessage(FAKE_EVENTS[category]!, { footer: FAKE });
    }
  }
}
