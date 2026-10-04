'use client';
import { useState } from 'react';
import { Dialog } from './Dialog';
import { ImageUploadField } from './image-upload';
import { createPack } from '../actions';

const STEPS = ['Details', 'Visual', 'Timing'];

const PRESETS = [
  { label: 'Gold',   accent: 'rgb(241,187,6)',   tear: 'rgb(218,163,18)' },
  { label: 'Purple', accent: 'rgb(147,51,234)',   tear: 'rgb(109,40,217)' },
  { label: 'Blue',   accent: 'rgb(59,130,246)',   tear: 'rgb(37,99,235)'  },
  { label: 'Green',  accent: 'rgb(34,197,94)',    tear: 'rgb(22,163,74)'  },
  { label: 'Red',    accent: 'rgb(239,68,68)',    tear: 'rgb(220,38,38)'  },
  { label: 'Pink',   accent: 'rgb(236,72,153)',   tear: 'rgb(219,39,119)' },
];

export function PackWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [accent, setAccent] = useState('rgb(241,187,6)');
  const [tear, setTear] = useState('rgb(218,163,18)');
  const [error, setError] = useState('');

  function reset() {
    setStep(1); setName(''); setActive(true);
    setAccent('rgb(241,187,6)'); setTear('rgb(218,163,18)'); setError('');
  }

  function handleClose() { reset(); onClose(); }

  function goNext() {
    if (step === 1 && !name.trim()) { setError('Pack name is required'); return; }
    setError(''); setStep(s => s + 1);
  }

  return (
    <Dialog open={open} onClose={handleClose} size="lg">
      {/* Step indicator */}
      <div className="flex items-center gap-0 px-6 pt-6 pb-2">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = step > n;
          const current = step === n;
          return (
            <div key={label} className="flex items-center gap-0 flex-1 last:flex-none">
              <div className="flex items-center gap-2 shrink-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                  done    ? 'bg-yellow-500 text-gray-950'
                  : current ? 'bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500/60'
                  : 'bg-gray-800 text-gray-600'
                }`}>
                  {done ? '✓' : n}
                </div>
                <span className={`text-sm font-medium transition-colors ${current ? 'text-white' : done ? 'text-gray-400' : 'text-gray-600'}`}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-3 transition-colors ${done ? 'bg-yellow-500/40' : 'bg-gray-800'}`} />
              )}
            </div>
          );
        })}
      </div>

      <form action={createPack}>
        {/* Hidden inputs for controlled values */}
        <input type="hidden" name="active" value={active ? 'true' : 'false'} />
        <input type="hidden" name="accentColor" value={accent} />
        <input type="hidden" name="tearBorderColor" value={tear} />

        <div className="px-6 py-5 space-y-4 min-h-[280px]">

          {/* ── Step 1: Details ── */}
          <div className={step === 1 ? 'space-y-4' : 'hidden'}>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Pack Name <span className="text-red-400">*</span>
              </label>
              <input
                name="name"
                value={name}
                onChange={e => { setName(e.target.value); setError(''); }}
                placeholder="e.g. Cheesy Starter Pack"
                autoFocus
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 transition-colors"
              />
              {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
            </div>

            <ImageUploadField name="coverImageUrl" />

            <button
              type="button"
              onClick={() => setActive(a => !a)}
              className="flex items-center gap-3 group"
            >
              <div className={`w-10 h-6 rounded-full relative transition-colors ${active ? 'bg-yellow-500' : 'bg-gray-700'}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${active ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
              <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
                Active — included in draws
              </span>
            </button>
          </div>

          {/* ── Step 2: Visual ── */}
          <div className={step === 2 ? 'space-y-4' : 'hidden'}>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Color Preset</label>
              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => { setAccent(p.accent); setTear(p.tear); }}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all ${
                      accent === p.accent
                        ? 'bg-gray-700 text-white ring-1 ring-yellow-500/40'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-750 hover:text-white'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full shrink-0 ring-1 ring-white/10" style={{ background: p.accent }} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Accent Color</label>
                <input
                  value={accent}
                  onChange={e => setAccent(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-500 transition-colors"
                />
                <p className="text-xs text-gray-600 mt-1">CSS color for glow/holo overlay</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Tear Border Color</label>
                <input
                  value={tear}
                  onChange={e => setTear(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Holo Min Stars</label>
              <input
                name="holoMinStars"
                type="number"
                min="1"
                max="5"
                defaultValue="5"
                className="w-32 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500 transition-colors"
              />
              <p className="text-xs text-gray-600 mt-1">Cards with ≥ this many stars get the holographic effect</p>
            </div>
          </div>

          {/* ── Step 3: Timing ── */}
          <div className={step === 3 ? 'space-y-4' : 'hidden'}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Card Display Time (s)</label>
                <input name="cardTime" type="number" defaultValue="3" min="1"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500 transition-colors" />
                <p className="text-xs text-gray-600 mt-1">How long the card stays on screen</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Cooldown (s)</label>
                <input name="cooldownTime" type="number" defaultValue="1" min="0"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500 transition-colors" />
                <p className="text-xs text-gray-600 mt-1">Delay between queued draws</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Sound Volume</label>
                <input name="soundVolume" type="number" defaultValue="1.0" min="0" max="1" step="0.1"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500 transition-colors" />
                <p className="text-xs text-gray-600 mt-1">0 = mute, 1 = full</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Draw Weight</label>
                <input name="weight" type="number" defaultValue="1" min="1"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500 transition-colors" />
                <p className="text-xs text-gray-600 mt-1">Relative chance vs other packs in this season</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between pt-2 border-t border-gray-800">
          <button
            type="button"
            onClick={step === 1 ? handleClose : () => setStep(s => s - 1)}
            className="px-4 py-2 text-sm text-gray-500 hover:text-white transition-colors"
          >
            {step === 1 ? 'Cancel' : '← Back'}
          </button>
          {step < STEPS.length ? (
            <button
              type="button"
              onClick={goNext}
              className="px-5 py-2.5 tcg-btn rounded-xl text-sm transition-colors"
            >
              Next →
            </button>
          ) : (
            <button
              type="submit"
              className="px-5 py-2.5 tcg-btn rounded-xl text-sm transition-colors"
            >
              Create Pack →
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
