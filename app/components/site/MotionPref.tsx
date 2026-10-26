'use client';
import { useEffect } from 'react';

export const MOTION_EVENT = 'tcg:motion';

/** Puts the viewer's motion setting on <html> (globals.css styles `[data-motion="reduce"]` as an ancestor). It is a client effect because the frame around it is prerendered and can't know the setting. */
export function MotionPref({ motion }: { motion: string }) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.motion = motion;
    window.dispatchEvent(new Event(MOTION_EVENT)); // tells anything that already read the old value (the binder)
    return () => { delete root.dataset.motion; };
  }, [motion]);
  return null;
}
