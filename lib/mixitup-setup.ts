import type { MixItUpSettings } from './mixitup-core';

// Paste-ready text for the Mix It Up page. Nothing here calls Mix It Up.

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

export interface CommandSetup {
  /** The chat word, with the !. */
  command: string;
  url: string;
  body: string;
  /** The reply field a Chat Message should say. */
  replyField: 'message';
}

/** One block per switched-on command. The body is what Mix It Up posts to the command webhook. */
export function commandSetups(commands: { name: string; enabled: boolean }[], webhookUrl: string, secret: string): CommandSetup[] {
  return commands.filter(c => c.enabled && c.name.trim()).map(c => {
    const name = c.name.trim();
    return {
      command: `!${name}`,
      url: webhookUrl,
      body: pretty({ secret, command: name, username: '$username', args: '$allargs' }),
      replyField: 'message' as const,
    };
  });
}

/** The address and body for one incoming webhook, as the Mix It Up Web Request action wants them (setup wizard, ROADMAP 55.1). */
export function incomingSetup(url: string, secret: string, fields: Record<string, string>): { url: string; body: string } {
  return { url, body: pretty({ secret, ...fields }) };
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
