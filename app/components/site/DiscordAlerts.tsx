'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { CHANNEL_NAME } from '@/lib/site';
import { PUSH_KIND_LABELS, type PushKind } from '@/lib/push-core';
import { DISCORD_DM_KINDS, type DiscordLinkView } from '@/lib/discord-dm-core';

interface DiscordInfo {
  enabled: boolean;
  linked: DiscordLinkView | null;
}

const ERROR_MESSAGES: Record<string, string> = {
  in_use: 'This Discord account is already linked to another collector.',
  expired: 'Linking timed out. Please try again.',
  denied: 'Discord authorization was cancelled.',
  failed: 'Could not link your Discord account. Please try again.',
  unavailable: 'Discord linking is not available right now.',
};

export function DiscordAlerts() {
  const searchParams = useSearchParams();
  const [info, setInfo] = useState<DiscordInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch('/api/account/discord', { cache: 'no-store' }).catch(() => null);
    if (!r?.ok) return;
    const data = (await r.json().catch(() => null)) as DiscordInfo | null;
    if (data) setInfo(data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const err = searchParams?.get('discord_error');
    const ok = searchParams?.get('discord');
    if (err && ERROR_MESSAGES[err]) {
      setMsg(ERROR_MESSAGES[err]);
      setIsError(true);
    } else if (ok === 'linked') {
      setMsg('Your Discord account was linked.');
      setIsError(false);
    }
  }, [searchParams]);

  if (!info?.enabled) return null;

  const linked = info.linked;

  async function unlink() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/account/discord', { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not unlink account.');
      setInfo(p => (p ? { ...p, linked: null } : p));
      setMsg('Your Discord account was unlinked.');
      setIsError(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not unlink.');
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/account/discord', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; linked?: DiscordLinkView };
      if (!res.ok) {
        if (data.error === 'closed') {
          setInfo(p => (p && p.linked ? { ...p, linked: { ...p.linked, dmStatus: 'closed' } } : p));
          setMsg('Could not send a DM. Check your server privacy settings to allow direct messages.');
        } else {
          setMsg(data.error || 'Failed to send test DM.');
        }
        setIsError(true);
      } else {
        if (data.linked) setInfo(p => (p ? { ...p, linked: data.linked ?? null } : p));
        setMsg('Sent. Check your Discord DMs.');
        setIsError(false);
      }
    } catch {
      setMsg('Failed to send test message.');
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function toggleKind(k: PushKind) {
    if (!linked || busy) return;
    const kinds = linked.kinds.includes(k)
      ? linked.kinds.filter(x => x !== k)
      : DISCORD_DM_KINDS.filter(x => x === k || linked.kinds.includes(x));

    try {
      const res = await fetch('/api/account/discord', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kinds }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; linked?: DiscordLinkView };
      if (res.ok && data.linked) {
        setInfo(p => (p ? { ...p, linked: data.linked ?? null } : p));
      }
    } catch {
      /* ignore */
    }
  }

  const linkedDate = linked
    ? new Date(linked.linkedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : null;

  return (
    <div id="discord" className="py-3 space-y-3 border-t border-gray-800">
      <div>
        <p className="text-sm font-semibold text-gray-100">Discord direct messages</p>
        <p className="text-xs text-gray-500">
          Get notices as direct messages from the Cheesy TCG bot in Discord. You must be in the {CHANNEL_NAME} Discord server with direct messages allowed.
        </p>
      </div>

      {msg && (
        <p role="status" className={`text-xs ${isError ? 'text-red-300' : 'text-yellow-300'}`}>
          {msg}
        </p>
      )}

      {linked ? (
        <div className="space-y-3">
          <div className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-sm text-gray-200 flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 flex items-center gap-1.5">
              <Icon name="chat" className="text-yellow-400" />
              <span className="font-semibold">@{linked.username}</span>
              <span className="text-xs text-gray-500">· linked {linkedDate}</span>
            </span>
            <span className="flex items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={sendTest}
                className="text-xs font-semibold text-yellow-400 hover:text-yellow-300 disabled:opacity-50"
              >
                Send me a test DM
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={unlink}
                className="text-xs font-semibold text-red-300 hover:text-red-200 disabled:opacity-50"
              >
                Unlink
              </button>
            </span>
          </div>

          {linked.dmStatus === 'closed' && (
            <div className="rounded-lg bg-amber-950/40 border border-amber-500/40 p-3 text-xs text-amber-200 space-y-1">
              <p className="font-semibold">Direct messages are blocked</p>
              <p>We could not send a DM to your Discord account. Check your privacy settings for the {CHANNEL_NAME} server to allow direct messages from server members.</p>
            </div>
          )}

          <fieldset className="fieldset" disabled={busy}>
            <legend className="fieldset-legend">DM me for (saved at once)</legend>
            {DISCORD_DM_KINDS.map(k => (
              <label key={k} className="flex items-center gap-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  role="switch"
                  checked={linked.kinds.includes(k)}
                  onChange={() => toggleKind(k)}
                  className="toggle toggle-sm toggle-primary"
                />
                {PUSH_KIND_LABELS[k]}
              </label>
            ))}
            <p className="fieldset-label">A DM is only sent when the matching bell notice above is on, too.</p>
          </fieldset>
        </div>
      ) : (
        <div>
          <a
            href="/auth/discord"
            className="btn btn-sm btn-primary rounded-xl font-bold inline-flex items-center gap-1.5"
          >
            <Icon name="link" />
            Link Discord
          </a>
        </div>
      )}
    </div>
  );
}
