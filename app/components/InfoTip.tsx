'use client';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { GLOSSARY, type TermId } from '@/lib/glossary';

const WIDTH = 288;   // popover width in px, shrunk to fit narrow screens
const MARGIN = 8;    // gap kept to the screen edge

/**
 * A small "i" button next to a term. Opens a short explanation (from lib/glossary.ts) on hover, on keyboard focus and on tap,
 * closes on Esc or a tap outside, and stays inside the screen. The popover is fixed-positioned so a scrolling or clipped
 * parent (a table, a card with overflow hidden) cannot cut it off.
 */
export function InfoTip({ term, className = '' }: { term: TermId; className?: string }) {
  const entry = GLOSSARY[term];
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const pointer = useRef<string>('mouse');
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback(() => { clearTimeout(closeTimer.current); setOpen(true); }, []);
  // A short delay lets the pointer travel from the button to the popover (to reach the FAQ link) without it closing.
  const hideSoon = useCallback(() => { clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOpen(false), 150); }, []);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const width = Math.min(WIDTH, vw - MARGIN * 2);
    const left = Math.max(MARGIN, Math.min(r.left + r.width / 2 - width / 2, vw - width - MARGIN));
    const h = pop.current?.offsetHeight ?? 0;
    const below = r.bottom + 6;
    const top = below + h > window.innerHeight - MARGIN && r.top - 6 - h >= MARGIN ? r.top - 6 - h : below;
    setPos({ left, top, width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    // Capture phase, and the key is swallowed, so Esc closes only the tip and not a dialog it sits in.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); } };
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  return (
    <span
      ref={wrap}
      className={`relative inline-block align-baseline ${className}`}
      onPointerEnter={e => { pointer.current = e.pointerType; if (e.pointerType === 'mouse') show(); }}
      onPointerLeave={e => { if (e.pointerType === 'mouse') hideSoon(); }}
      onBlur={e => { if (!wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}
    >
      <button
        ref={btn}
        type="button"
        aria-label={`What is ${entry.title.toLowerCase()}?`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onPointerDown={e => { pointer.current = e.pointerType; }}
        // Hovering already opened it for a mouse, so a click keeps it open; a tap toggles it.
        onClick={() => { clearTimeout(closeTimer.current); setOpen(o => (pointer.current === 'mouse' ? true : !o)); }}
        // Tabbing in opens it; a tap also focuses the button, and the click handler decides that one.
        onFocus={e => { if (e.currentTarget.matches(':focus-visible')) show(); }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-gray-500 hover:text-yellow-300 focus-visible:text-yellow-300 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-yellow-400/70"
      >
        <Icon name="info" className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span
          ref={pop}
          id={id}
          role="tooltip"
          style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { left: 0, top: 0, width: WIDTH, visibility: 'hidden' }}
          className="fixed z-60 block rounded-xl border border-gray-700 bg-gray-950 p-3 text-left text-xs font-normal normal-case tracking-normal leading-relaxed text-gray-300 shadow-xl shadow-black/50"
        >
          <strong className="block text-sm text-white mb-0.5">{entry.title}</strong>
          {entry.body}
          {entry.faq && (
            <Link href={`/faq#${entry.faq}`} className="mt-1.5 block font-semibold text-yellow-400 hover:text-yellow-300">More in the FAQ</Link>
          )}
        </span>
      )}
    </span>
  );
}
