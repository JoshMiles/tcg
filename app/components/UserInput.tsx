'use client';
import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from 'react';
import { Icon } from '@/app/components/Icon';
import { cleanQuery, type SearchItem } from '@/lib/site-search';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'defaultValue' | 'role'> & {
  /** Controlled: pass `value` and `onValueChange`. Leave `value` out and it keeps its own text (use `name` in a plain form). */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Called when a suggestion is chosen (with the username), after the text has been set. */
  onPick?: (username: string) => void;
  /** Classes for the wrapper around the input (the dropdown is positioned against it). */
  wrapperClassName?: string;
};

/**
 * A text box for a viewer's Twitch name that suggests collectors as you type (the same public search as the site search; collectors
 * an admin hid from the boards are not suggested, but any name can still be typed). Arrow keys move through the suggestions, Enter or a
 * click takes one, Escape closes the list. Without a suggestion highlighted, Enter behaves as it would in a plain input.
 */
export function UserInput({ value, defaultValue = '', onValueChange, onPick, wrapperClassName = 'relative', className, onKeyDown, onBlur, ...rest }: Props) {
  const [inner, setInner] = useState(defaultValue);
  const text = value ?? inner;
  const [hits, setHits] = useState<SearchItem[]>([]);
  const [index, setIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const skip = useRef(false); // set after picking, so the pick itself doesn't reopen the list
  const typed = useRef(false); // suggestions only open once the person has typed (a prefilled name must not pop a list open)
  const listId = useId();

  const set = (v: string) => { setInner(v); onValueChange?.(v); };

  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    const query = cleanQuery(text);
    if (!query) { setHits([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctl.signal, cache: 'no-store' })
        .then(r => (r.ok ? r.json() : { results: [] }))
        .then(d => { setHits((Array.isArray(d.results) ? d.results : []).filter((r: SearchItem) => r.kind === 'player')); setOpen(typed.current); })
        .catch(() => { /* suggestions are optional */ });
    }, 150);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [text]);
  useEffect(() => setIndex(-1), [hits]);

  // Nothing to suggest when the only match is exactly what is already typed.
  const shown = open && hits.length > 0 && !(hits.length === 1 && hits[0].label === cleanQuery(text).toLowerCase());
  function pick(name: string) {
    skip.current = true;
    set(name);
    setOpen(false);
    setHits([]);
    onPick?.(name);
  }

  return (
    <div className={wrapperClassName}>
      <input
        {...rest}
        value={text} onChange={e => { typed.current = true; set(e.target.value); setOpen(true); }} autoComplete="off" spellCheck={false}
        role="combobox" aria-expanded={shown} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={shown && index >= 0 ? `${listId}-${index}` : undefined}
        onKeyDown={e => {
          if (shown && e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(hits.length - 1, i + 1)); }
          else if (shown && e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(-1, i - 1)); }
          else if (shown && e.key === 'Enter' && index >= 0) { e.preventDefault(); pick(hits[index].label); }
          else if (e.key === 'Escape' && shown) { e.preventDefault(); setOpen(false); }
          onKeyDown?.(e);
        }}
        onBlur={e => { setTimeout(() => setOpen(false), 120); onBlur?.(e); }}
        className={className}
      />
      {shown && (
        <ul id={listId} role="listbox" className="absolute z-30 left-0 top-full mt-1 min-w-full w-max max-w-[18rem] rounded-xl border border-gray-700 bg-gray-900 shadow-card p-1">
          {hits.map((h, i) => (
            <li key={h.id} id={`${listId}-${i}`} role="option" aria-selected={i === index}>
              <button type="button" tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => pick(h.label)} onMouseMove={() => setIndex(i)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm ${i === index ? 'bg-yellow-500/10 text-yellow-100' : 'text-gray-300'}`}>
                <Icon name="user" className="text-gray-500" /><span className="font-mono truncate">{h.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
