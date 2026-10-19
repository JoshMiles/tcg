'use client';
import { Icon } from '@/app/components/Icon';
import { useEffect, useMemo, useRef, useState } from 'react';

type ViewKind = 'panel' | 'mobile' | 'video';
type Who = { kind: 'anon' } | { kind: 'viewer'; login: string } | { kind: 'broadcaster'; login: string };

const FILES: Record<ViewKind, string> = { panel: 'panel.html', mobile: 'mobile.html', video: 'video_component.html' };
const VIEW_LABEL: Record<ViewKind, string> = { panel: 'Panel (under the video)', mobile: 'Mobile', video: 'Video component (over the video)' };

/**
 * A stand-in for a Twitch channel page: a fake stream with the overlay in it, and the REAL extension panel (panel.html, mobile.html or
 * video_component.html) loaded in an iframe with a pretend Twitch helper (public/twitch-panel/mock-twitch-ext.js). Everything it does
 * goes through the real API routes, inside the sandbox you are in: log in, upgrade, leaderboard, logout.
 */
export function FakeTwitch({ sandboxId, users, channel }: { sandboxId: string; users: string[]; channel: string }) {
  const [who, setWho] = useState<Who>({ kind: 'anon' });
  const [view, setView] = useState<ViewKind>('panel');
  const [shared, setShared] = useState(false);       // identity already shared (carried across reloads for the same viewer)
  const [showOverlay, setShowOverlay] = useState(true);
  const [src, setSrc] = useState('');
  const [custom, setCustom] = useState('');

  // What the iframe was last loaded with lives in a ref too, so back-to-back changes never read a stale render.
  const cur = useRef<{ who: Who; view: ViewKind; shared: boolean }>({ who: { kind: 'anon' }, view: 'panel', shared: false });
  const login = who.kind === 'anon' ? '' : who.login;
  const role = who.kind === 'broadcaster' ? 'broadcaster' : 'viewer';

  // The iframe only reloads when the viewer / view / share state is deliberately applied, never as a side effect of the panel
  // asking for the share prompt (that would throw away the panel's own state).
  function load(next: { who?: Who; view?: ViewKind; shared?: boolean } = {}) {
    cur.current = { who: next.who ?? cur.current.who, view: next.view ?? cur.current.view, shared: next.shared ?? cur.current.shared };
    const { who: w, view: v, shared: s } = cur.current;
    const l = w.kind === 'anon' ? '' : w.login;
    const r = w.kind === 'broadcaster' ? 'broadcaster' : 'viewer';
    setSrc(`/twitch-panel/${FILES[v]}?mock=1&as=${encodeURIComponent(l)}&share=${s ? 1 : 0}&role=${r}&n=${Date.now()}`);
  }
  useEffect(() => { load(); /* first load */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The pretend Twitch prompt tells us when the viewer shared their identity (the panel re-authorises by itself).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin === location.origin && e.data?.type === 'tcg-mock-share') { cur.current.shared = !!e.data.share; setShared(!!e.data.share); }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const choose = (w: Who) => { setWho(w); setShared(false); load({ who: w, shared: false }); };
  const pickView = (v: ViewKind) => { setView(v); load({ view: v }); };

  const opts: { label: string; w: Who }[] = useMemo(() => [
    { label: 'Not logged in to Twitch', w: { kind: 'anon' } },
    ...users.map(u => ({ label: u, w: { kind: 'viewer', login: u } as Who })),
  ], [users]);
  const is = (w: Who) => w.kind === who.kind && (w.kind === 'anon' || (who.kind !== 'anon' && w.login === who.login));

  const chip = (active: boolean) => `px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${active ? 'border-purple-400 bg-purple-500/20 text-purple-200' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`;
  const frame = view === 'mobile' ? { w: 375, h: 667 } : view === 'video' ? null : { w: 318, h: 500 };

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Who is watching?</p>
          <div className="flex flex-wrap gap-1.5">
            {opts.map(o => <button key={o.label} type="button" onClick={() => choose(o.w)} aria-pressed={is(o.w)} className={chip(is(o.w))}>{o.label}</button>)}
          </div>
          <form
            className="mt-2 flex items-center gap-2"
            onSubmit={e => { e.preventDefault(); const l = custom.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''); if (l) { choose({ kind: 'viewer', login: l }); setCustom(''); } }}
          >
            <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="another name (created on first login)" className="w-64 rounded-lg bg-gray-950 border border-gray-700 px-3 py-1.5 text-xs text-white focus:outline-hidden focus:border-purple-400" />
            <button type="submit" className={chip(false)}>Watch as</button>
          </form>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Extension view</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(VIEW_LABEL) as ViewKind[]).map(v => <button key={v} type="button" onClick={() => pickView(v)} aria-pressed={view === v} className={chip(view === v)}>{VIEW_LABEL[v]}</button>)}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {login && (
              <button type="button" onClick={() => { const w: Who = who.kind === 'broadcaster' ? { kind: 'viewer', login } : { kind: 'broadcaster', login }; setWho(w); load({ who: w }); }} className={chip(who.kind === 'broadcaster')} title="Twitch signs the broadcaster role for the channel owner; the panel logs them in without the share prompt">
                <Icon name="crown" className="mr-1" />As the broadcaster
              </button>
            )}
            <button type="button" onClick={() => load()} className={chip(false)}>↻ Reload panel</button>
            <label className="flex items-center gap-1.5 text-xs text-gray-400 ml-2">
              <input type="checkbox" checked={showOverlay} onChange={e => setShowOverlay(e.target.checked)} className="accent-purple-500" /> Overlay in the stream
            </label>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          {who.kind === 'anon' && 'Anonymous viewer: the panel shows its login screen, and “Login with Twitch” finds there is no identity to share.'}
          {who.kind === 'viewer' && (shared ? `${who.login} has shared their identity: the panel logs them in.` : `${who.login} is logged in to Twitch but has not shared their identity yet: press “Login with Twitch” in the panel to see the share prompt.`)}
          {who.kind === 'broadcaster' && `${who.login} is the broadcaster: the panel logs them in directly, with no share prompt.`}
          {' '}Everything here happens inside the sandbox <span className="text-gray-300 font-semibold">{sandboxId}</span>.
        </p>
      </div>

      {/* The fake Twitch page */}
      <div className="rounded-2xl overflow-hidden border border-purple-500/30 bg-[#0e0e10] text-[#efeff1]">
        <div className="flex items-center gap-3 px-4 h-11 bg-[#18181b] border-b border-black/60">
          <span className="font-black tracking-tight text-[#9146ff] text-lg">twitch</span>
          <span className="text-[10px] uppercase tracking-wider text-gray-500 border border-gray-700 rounded-sm px-1.5 py-0.5">fake</span>
          <span className="ml-auto text-xs text-gray-400">{login ? `Logged in as ${login}` : 'Not logged in'}</span>
        </div>
        <div className="p-4 flex flex-col xl:flex-row gap-4 items-start">
          <div className="w-full xl:flex-1 min-w-0 space-y-3">
            {/* Stream */}
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-linear-to-br from-[#1f1147] via-[#2b1a63] to-[#0b3b4a]">
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white/30 select-none">
                <span className="text-5xl"><Icon name="gamepad" className="w-12 h-12" /></span>
                <span className="mt-2 text-sm font-semibold">{channel}, pretend stream</span>
              </div>
              {showOverlay && <iframe title="Overlay" src={`/overlay.html?sandbox=${encodeURIComponent(sandboxId)}`} style={{ colorScheme: 'light' }} className="absolute inset-0 w-full h-full border-0" />}
              <span className="absolute top-2 left-2 bg-red-600 text-white text-[11px] font-black rounded-sm px-1.5 py-0.5 tracking-wide">LIVE</span>
              {view === 'video' && src && (
                <iframe title="Extension (video component)" src={src} className="absolute top-3 right-3 w-[34%] h-[78%] border-0 rounded-lg shadow-2xl" />
              )}
            </div>
            <div>
              <p className="font-bold">{channel}</p>
              <p className="text-xs text-gray-400">Pretend stream title · the real extension runs below</p>
            </div>
          </div>

          {/* Panel / mobile frame */}
          {frame && (
            <div className="shrink-0 mx-auto xl:mx-0">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1.5">{view === 'mobile' ? 'Mobile view' : 'Panel'} · {frame.w}×{frame.h}</p>
              <div className={view === 'mobile' ? 'rounded-[28px] border-[6px] border-gray-700 overflow-hidden bg-black' : 'border border-gray-700 bg-[#18181b]'} style={{ width: frame.w + (view === 'mobile' ? 12 : 2), height: frame.h + (view === 'mobile' ? 12 : 2) }}>
                {src && <iframe title="Extension" src={src} style={{ width: frame.w, height: frame.h }} className="border-0 block bg-[#0e0e10]" />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
