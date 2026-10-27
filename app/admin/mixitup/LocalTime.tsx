'use client';
import { useEffect, useState } from 'react';

const FORMAT: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };

/**
 * A log row's time: the viewer's local time with "x ago" beside it. The server and the first render use UTC (so they match); the local
 * time replaces it once the page is in the browser. `ago` comes from the server because the helper that builds it reads the database.
 */
export function LocalTime({ at, ago }: { at: number; ago: string }) {
  const [local, setLocal] = useState(false);
  useEffect(() => setLocal(true), []);
  const when = new Intl.DateTimeFormat('en-GB', local ? FORMAT : { ...FORMAT, timeZone: 'UTC' }).format(at);
  return (
    <time className="text-xs text-gray-500 tabular-nums" dateTime={new Date(at).toISOString()} title={new Date(at).toISOString()}>
      {when}{local ? '' : ' UTC'} <span className="text-gray-600">({ago})</span>
    </time>
  );
}
