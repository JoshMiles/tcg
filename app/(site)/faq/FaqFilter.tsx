'use client';

import { useRef, useState, type ReactNode } from 'react';

/** Search box over server-rendered FAQ sections: hides non-matching questions and empty sections in the DOM, so the FAQ stays crawlable and readable without JS. */
export function FaqFilter({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [none, setNone] = useState(false);

  function filter(value: string) {
    const needle = value.trim().toLowerCase();
    let shown = 0;
    root.current?.querySelectorAll('section').forEach(sec => {
      let any = 0;
      sec.querySelectorAll('details').forEach(d => {
        const hit = !needle || (d.textContent ?? '').toLowerCase().includes(needle);
        d.hidden = !hit;
        if (hit) any++;
      });
      sec.hidden = !any;
      shown += any;
    });
    setNone(shown === 0);
  }

  return (
    <>
      <input
        type="search"
        aria-label="Search the FAQ"
        placeholder="Search the FAQ..."
        onChange={e => filter(e.target.value)}
        className="input input-bordered w-full max-w-md"
      />
      {none && <p role="status" className="text-gray-400">No matches. Try a different word.</p>}
      <div ref={root} className="space-y-10">{children}</div>
    </>
  );
}
