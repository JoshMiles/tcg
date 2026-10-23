'use client';
import dynamic from 'next/dynamic';

/** ShareImageButton, loaded when it is first rendered (for places it only shows after a click, like the Dex's card dialog). */
export const ShareImageButtonLazy = dynamic(() => import('./ShareImage').then(m => m.ShareImageButton), { ssr: false });
