'use client';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/app/components/Icon';
import { uploadAudioFile, uploadImageFile } from '../../../components/upload-client';
import { cardThumbUrl } from '@/lib/card-art';

export const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors disabled:opacity-50';

/** A section of the properties panel: collapses, and shows a dot when something in it changed or has a problem. */
export function Section({ title, children, dot, defaultOpen = true, id }: { title: string; children: ReactNode; dot?: 'changed' | 'problem' | null; defaultOpen?: boolean; id?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className="border-b border-gray-800 last:border-0">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-white/[0.03]">
        <span className="flex items-center gap-2">{title}{dot && <span aria-label={dot === 'problem' ? 'Has a problem' : 'Has unsaved changes'} className={`w-2 h-2 rounded-full ${dot === 'problem' ? 'bg-amber-400' : 'bg-yellow-400'}`} />}</span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} className="text-gray-500" />
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </section>
  );
}

export function Field({ label, children, help, htmlFor }: { label: string; children: ReactNode; help?: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
      {help && <p className="text-xs text-gray-600 mt-1">{help}</p>}
    </div>
  );
}

/** A number input that keeps what you type (so "1." or an empty box doesn't jump) and reports a number when it parses. */
export function NumberInput({ value, onChange, min, max, step = 'any', id, disabled, ariaLabel }: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number | 'any'; id?: string; disabled?: boolean; ariaLabel?: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      id={id} type="number" aria-label={ariaLabel} className={inputCls} min={min} max={max} step={step} disabled={disabled}
      value={text !== null && text.trim() !== '' && Number(text) === value ? text : String(value)}
      onChange={e => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n); }}
      onBlur={() => setText(null)}
    />
  );
}

export function Stars({ value, onChange, label = 'Stars' }: { value: number; onChange: (n: number) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => onChange(n)}
          className={`text-2xl leading-none px-0.5 transition-colors ${n <= value ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-500'}`}>★</button>
      ))}
    </div>
  );
}

/** Art for a card or a pack cover: drop a file, paste an image, or pick one. Uploads through the same Blob path as everywhere else. */
export function ArtDrop({ label, value, onChange, hint }: { label: string; value: string; onChange: (url: string) => void; hint?: string }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  async function take(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('That is not an image.'); return; }
    setError('');
    try { onChange(await uploadImageFile(file, p => setBusy(p === 'uploading' ? 'Uploading…' : 'Optimising…'))); }
    catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setBusy(''); }
  }
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-gray-400 mb-1">{label}</label>
      <div
        onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files[0]); }}
        onPaste={e => { const f = [...e.clipboardData.files].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); void take(f); } }}
        tabIndex={0}
        className={`flex items-center gap-3 rounded-lg border border-dashed p-2 outline-none focus:border-yellow-500 ${over ? 'border-yellow-500 bg-yellow-500/5' : 'border-gray-700'}`}
      >
        <div className="w-14 h-20 shrink-0 rounded-md bg-gray-800 overflow-hidden flex items-center justify-center">
          {value ? <img src={cardThumbUrl(value)} alt="" className="w-full h-full object-cover" /> : <Icon name="image" className="w-6 h-6 text-gray-600" />}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-xs text-gray-400">{busy || 'Drop an image here, paste one, or'} {!busy && <button type="button" onClick={() => input.current?.click()} className="font-bold text-yellow-400 hover:text-yellow-300">pick a file</button>}</p>
          <input id={id} type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="or paste an address" className={`${inputCls} !py-1 !text-xs`} />
          <input ref={input} type="file" accept="image/*,.gif" className="hidden" onChange={e => { void take(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {value && <button type="button" onClick={() => onChange('')} className="self-start text-xs text-gray-500 hover:text-white px-1" aria-label={`Remove ${label}`}><Icon name="x" /></button>}
      </div>
      {error && <p role="alert" className="text-xs text-red-300 mt-1">{error}</p>}
      {hint && <p className="text-xs text-gray-600 mt-1">{hint}</p>}
    </div>
  );
}

/** A card's sound: pick a file (the same upload path as before), play it, or use the default one. */
export function SoundField({ value, onChange, defaultUrl }: { value: string; onChange: (url: string) => void; defaultUrl?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  const input = useRef<HTMLInputElement>(null);
  async function take(file?: File) {
    if (!file) return;
    setBusy(true); setError('');
    try { onChange(await uploadAudioFile(file)); } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); } finally { setBusy(false); }
  }
  return (
    <div>
      <span className="block text-xs text-gray-400 mb-1">Sound</span>
      <div className="flex flex-wrap items-center gap-2">
        <input type="text" aria-label="Sound address" value={value} onChange={e => onChange(e.target.value)} placeholder="none" className={`${inputCls} flex-1 min-w-[8rem] !text-xs`} />
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="px-2.5 py-2 text-xs font-bold rounded-lg bg-gray-700 hover:bg-gray-600 text-white">{busy ? 'Uploading…' : 'Upload'}</button>
        <button type="button" disabled={!value} onClick={() => { audio.current?.pause(); audio.current = new Audio(value); void audio.current.play().catch(() => setError('Could not play that.')); }} className="px-2.5 py-2 text-xs font-bold rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 disabled:opacity-40" aria-label="Play the sound"><Icon name="play" /></button>
        <input ref={input} type="file" accept="audio/*" className="hidden" onChange={e => { void take(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {defaultUrl && value !== defaultUrl && <button type="button" onClick={() => onChange(defaultUrl)} className="mt-1 text-xs font-bold text-yellow-400 hover:text-yellow-300">Use the default sound</button>}
      {error && <p role="alert" className="text-xs text-red-300 mt-1">{error}</p>}
    </div>
  );
}
