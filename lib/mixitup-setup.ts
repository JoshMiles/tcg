import type { MixItUpSettings } from './mixitup-core';
import { COMMAND_ACTIONS, type CommandActionId } from './commands-core';
import type { PresetSpec } from './mixitup-presets';

// Paste-ready text for the Mix It Up page. Nothing here calls Mix It Up.

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

/** A different number on every run of a Mix It Up command (Mix It Up's $randomnumber<min>:<max>, new each time it is read), so a retry of one request is answered once and a new run is not mistaken for a repeat (ROADMAP 55.3). */
export const REQUEST_ID = '$randomnumber1:2000000000';

export interface CommandSetup {
  /** The chat word, with the !. */
  command: string;
  url: string;
  body: string;
  /** The reply field a Chat Message should say. */
  replyField: 'message';
  /** What the Download for Mix It Up link needs. */
  preset: PresetSpec;
}

/** One block per switched-on command. The body is what Mix It Up posts to the command webhook. */
export function commandSetups(commands: { name: string; enabled: boolean; aliases?: string[]; action?: CommandActionId }[], webhookUrl: string, secret: string): CommandSetup[] {
  return commands.filter(c => c.enabled && c.name.trim()).map(c => {
    const name = c.name.trim();
    const fields = { command: name, username: '$username', args: '$allargs' };
    return {
      command: `!${name}`,
      url: webhookUrl,
      body: pretty({ secret, ...fields }),
      replyField: 'message' as const,
      preset: { kind: 'chat' as const, name, path: 'command' as const, fields, aliases: c.aliases?.map(a => a.trim()).filter(Boolean), reply: [...new Set(['message', ...(c.action ? COMMAND_ACTIONS[c.action].vars.map(v => v.name) : [])])] },
    };
  });
}

/** The address and body for one incoming webhook, as the Mix It Up Web Request action wants them (setup wizard, ROADMAP 55.1). */
export function incomingSetup(url: string, secret: string, fields: Record<string, string>): { url: string; body: string } {
  return { url, body: pretty({ secret, ...fields }) };
}

/** The built-in !pack command (setup wizard and Mix It Up commands helper): same card in both. It calls /api/webhooks/pull, not the command route, so it is not in the command builder. */
export function packSetup(siteUrl: string, secret: string): { url: string; body: string; preset: PresetSpec } {
  const fields = { username: '$username', pack: '$allargs', requestId: REQUEST_ID };
  return { ...incomingSetup(`${siteUrl}/api/webhooks/pull`, secret, fields), preset: { kind: 'chat', name: 'pack', path: 'pull', fields, reply: ['message', 'left', 'balance'] } };
}

export interface PaidPullSetup {
  balanceUrl: string;
  deductUrl: string;
  /** Deduct uses the balance address. Mix It Up tells the two apart by `action`. */
  sameAddress: boolean;
  balanceBody: string;
  deductBody: string;
  /** The JSON the balance action should answer. The number sits at the saved field. */
  balanceAnswer: string;
  currency: string;
}

/** The two requests this site sends, filled from the saved settings. */
export function paidPullSetup(s: Pick<MixItUpSettings, 'balanceUrl' | 'deductUrl' | 'secret' | 'currency' | 'cost' | 'message' | 'balanceField'>): PaidPullSetup {
  const field = s.balanceField.trim() || 'balance';
  return {
    balanceUrl: s.balanceUrl,
    deductUrl: s.deductUrl || s.balanceUrl,
    sameAddress: !s.deductUrl,
    currency: s.currency,
    balanceBody: pretty({ action: 'balance', secret: s.secret, username: '<viewer>', currency: s.currency }),
    deductBody: pretty({ action: 'deduct', secret: s.secret, username: '<viewer>', amount: s.cost, currency: s.currency, message: s.message, pullId: '<pull id>' }),
    balanceAnswer: `{ "${field}": 0 }`,
  };
}
