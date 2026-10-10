'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * Debounced autosave. Call `save(value)` whenever `value` changes and `enabled` is true.
 * - Saves are serialised: if the value changes mid-save, the latest value is saved right after.
 * - `signature` decides what counts as a change (default: JSON of the value), so server-assigned fields can
 *   be excluded and merged back without triggering another save.
 * - `flush()` saves immediately and resolves when nothing is pending — await it before navigating away.
 */
export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  { enabled, delay = 900, signature = (v: T) => JSON.stringify(v) }: { enabled: boolean; delay?: number; signature?: (v: T) => string },
) {
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const latest = useRef(value);
  const lastSaved = useRef<string | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  const sigRef = useRef(signature);
  saveRef.current = save;
  sigRef.current = signature;
  latest.current = value;

  // The first value seen once enabled is the baseline (already stored), not a change.
  useEffect(() => {
    if (enabled && lastSaved.current === null) lastSaved.current = sigRef.current(latest.current);
  }, [enabled]);

  const run = useCallback(async () => {
    if (running.current) { await running.current; return; }
    const job = (async () => {
      // Loop so a change made while saving is picked up before we report "saved".
      for (;;) {
        const sig = sigRef.current(latest.current);
        if (sig === lastSaved.current) break;
        setState('saving');
        try {
          await saveRef.current(latest.current);
          lastSaved.current = sig;
          setError('');
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Save failed');
          setState('error');
          return;
        }
      }
      setState('saved');
    })();
    running.current = job;
    try { await job; } finally { running.current = null; }
  }, []);

  const sig = enabled ? signature(value) : '';
  useEffect(() => {
    if (!enabled || lastSaved.current === null || sig === lastSaved.current) return;
    setState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void run(); }, delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [sig, enabled, delay, run]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await run();
  }, [run]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (state !== 'dirty' && state !== 'saving' && state !== 'error') return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state]);

  return { state, error, flush };
}
