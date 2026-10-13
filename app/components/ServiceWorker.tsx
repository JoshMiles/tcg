'use client';
import { useEffect } from 'react';

/** Registers the offline-page service worker (production only; it caches nothing else). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => { /* optional: the site works fine without it */ });
  }, []);
  return null;
}
