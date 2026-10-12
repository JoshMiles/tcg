'use client';
import { useState } from 'react';

/** "YYYY-MM-DDTHH:mm" in the browser's local time, which is what <input type="datetime-local"> wants. */
function toLocalInput(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * A date and time picker that works in YOUR time zone but submits an exact moment (milliseconds since the epoch), because the
 * server runs in UTC and would otherwise read "9pm" as 9pm UTC. In a plain form the value goes in a hidden field named `name`
 * (empty = not set); controlled editors use `onChange`.
 */
export function DateTimeField({ label, name, defaultValue, onChange, help }: {
  label: string; name?: string; defaultValue?: number; onChange?: (ms: number | undefined) => void; help?: string;
}) {
  const [local, setLocal] = useState(toLocalInput(defaultValue));
  const ms = local ? new Date(local).getTime() : undefined;
  const valid = ms !== undefined && Number.isFinite(ms);
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="datetime-local"
          value={local}
          onChange={e => { setLocal(e.target.value); const v = e.target.value ? new Date(e.target.value).getTime() : undefined; onChange?.(v !== undefined && Number.isFinite(v) ? v : undefined); }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
        />
        {local && <button type="button" onClick={() => { setLocal(''); onChange?.(undefined); }} className="text-xs text-gray-500 hover:text-white underline underline-offset-2">Clear</button>}
      </div>
      {name && <input type="hidden" name={name} value={valid ? String(ms) : ''} />}
      {help && <p className="text-xs text-gray-600 mt-1">{help}</p>}
    </div>
  );
}
