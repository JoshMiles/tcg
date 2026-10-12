import { profileHref } from './profile-url';

// "g then a letter" navigation for the public site's Keyboard shortcuts experiment (pure, client-safe).
export const PUBLIC_SEQUENCE_MS = 1200;

export interface PublicGoKey { key: string; label: string; href: string | ((username: string) => string); needsLogin?: boolean }

export const PUBLIC_GO_KEYS: PublicGoKey[] = [
  { key: 'h', label: 'Home', href: '/' },
  { key: 'c', label: 'My collection', href: u => profileHref(u), needsLogin: true },
  { key: 'l', label: 'Leaderboard', href: '/leaderboard' },
  { key: 's', label: 'Season stats', href: '/stats' },
  { key: 'd', label: 'Card Dex', href: '/cards' },
  { key: 't', label: 'Trade', href: '/trade' },
  { key: 'a', label: 'My stats', href: '/account', needsLogin: true },
  { key: 'e', label: 'Settings', href: '/settings', needsLogin: true },
];

export interface PublicSeq { pending: boolean; at: number }
export const PUBLIC_IDLE: PublicSeq = { pending: false, at: 0 };

export function nextPublicKey(state: PublicSeq, key: string, now: number, username?: string): { state: PublicSeq; go?: string } {
  const k = key.toLowerCase();
  if (state.pending && now - state.at <= PUBLIC_SEQUENCE_MS) {
    const hit = PUBLIC_GO_KEYS.find(i => i.key === k);
    if (!hit || (hit.needsLogin && !username)) return { state: PUBLIC_IDLE };
    return { state: PUBLIC_IDLE, go: typeof hit.href === 'function' ? hit.href(username!) : hit.href };
  }
  return k === 'g' ? { state: { pending: true, at: now } } : { state: PUBLIC_IDLE };
}
