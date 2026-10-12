'use client';
import { useEffect, type RefObject } from 'react';
import { isTypingTarget } from '@/lib/shortcuts';

/** Pressing "/" anywhere on the page (outside a text field) focuses this input. One implementation for every list's search box. */
export function useSlashFocus(ref: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      e.preventDefault();
      ref.current?.focus();
      ref.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ref]);
}
