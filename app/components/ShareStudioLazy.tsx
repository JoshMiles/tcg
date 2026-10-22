'use client';
import dynamic from 'next/dynamic';

/** ShareStudio, loaded when it is first rendered (it sits behind a tab or a closed disclosure). */
export const ShareStudioLazy = dynamic(() => import('./ShareStudio').then(m => m.ShareStudio), { ssr: false });
