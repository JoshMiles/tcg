'use client';

import { useEffect, useRef, useState } from 'react';
import { onCaptchaRequest, type CaptchaRequest } from './captcha-client';

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  remove(id: string): void;
}
declare global { interface Window { turnstile?: TurnstileApi } }

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi | null> | null = null;

function loadTurnstile(): Promise<TurnstileApi | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) {
    loading = new Promise(resolve => {
      const s = document.createElement('script');
      s.src = SCRIPT; s.async = true;
      s.onload = () => resolve(window.turnstile ?? null);
      s.onerror = () => { loading = null; resolve(null); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/**
 * Shows Cloudflare Turnstile when an action asks for it. The check usually passes by itself, so the box stays invisible
 * unless Cloudflare needs the viewer to do something (or it takes more than a moment); then a small dialog appears.
 */
export function CaptchaHost() {
  const [req, setReq] = useState<CaptchaRequest | null>(null);
  const [visible, setVisible] = useState(false);
  const [problem, setProblem] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => onCaptchaRequest(r => { setProblem(''); setVisible(false); setReq(r); }), []);

  useEffect(() => {
    if (!req) return;
    let widget: string | null = null;
    let done = false;
    const finish = (token: string | null) => { if (done) return; done = true; req.resolve(token); setReq(null); };
    const slow = setTimeout(() => setVisible(true), 2500); // never leave someone waiting on a hidden box
    loadTurnstile().then(api => {
      if (done) return;
      if (!api || !box.current) { setProblem('The check could not load. Check your connection and try again.'); setVisible(true); return; }
      widget = api.render(box.current, {
        sitekey: req.siteKey,
        theme: 'dark',
        callback: (token: string) => finish(token),
        'before-interactive-callback': () => setVisible(true),
        'error-callback': () => { setProblem('The check hit a problem. Close this and try again.'); setVisible(true); },
        'timeout-callback': () => setVisible(true),
      });
    });
    return () => {
      clearTimeout(slow);
      if (!done) { done = true; req.resolve(null); }
      if (widget && window.turnstile) try { window.turnstile.remove(widget); } catch { /* already gone */ }
    };
  }, [req]);

  if (!req) return null;
  const cancel = () => { req.resolve(null); setReq(null); };
  return (
    <div
      role="dialog" aria-modal="true" aria-label="Quick check"
      className={`fixed inset-0 z-95 grid place-items-center p-4 bg-black/60 backdrop-blur-xs transition-opacity ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      onKeyDown={e => { if (e.key === 'Escape') cancel(); }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-5 shadow-2xl space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold text-white">Quick check</h2>
          <p className="text-sm text-gray-400 mt-1">{req.retry ? 'That one didn’t go through. Please try once more.' : 'Just making sure you’re a person. This keeps trading and upgrades fair.'}</p>
        </div>
        <div ref={box} className="min-h-[65px] flex justify-center" />
        {problem && <p role="alert" className="text-sm text-red-400">{problem}</p>}
        <button type="button" onClick={cancel} className="text-sm text-gray-400 hover:text-white">Cancel</button>
      </div>
    </div>
  );
}
