'use client';
import { useActionState, useState } from 'react';
import { PendingButton } from '@/app/components/PendingButton';
import type { ActionResult } from '../action-types';
import { Panel, fieldClass } from '../components/ui';
import { HAPPY_MINUTES_MAX } from '@/lib/mixitup-core';
import { endHappyHourAction, startHappyHourAction } from './happyhour-actions';

export interface HappyHourView { what: string; minutesLeft: number; by: string }

/** Mix It Up → Paid pulls: start or end a happy hour (ROADMAP 55.4c). Its own forms, apart from the settings form below it. */
export function HappyHourBox({ running }: { running: HappyHourView | null }) {
  const [kind, setKind] = useState<'free' | 'discount'>('free');
  const [started, start] = useActionState<ActionResult | null, FormData>(startHappyHourAction, null);
  const [ended, end] = useActionState<ActionResult | null, FormData>(() => endHappyHourAction(), null);
  const shown = [started, ended].find(r => r);
  return (
    <Panel title="Happy hour" icon="sparkles" hint="Cheaper or free paid pulls for a while. It ends on its own; starting a new one replaces the running one. The price is fixed when a pull is queued, so a pack already waiting keeps the price it was quoted.">
      {running
        ? <p role="status" className="text-sm text-green-300">Running: {running.what}, about {running.minutesLeft} minute{running.minutesLeft === 1 ? '' : 's'} left (started by {running.by}).</p>
        : <p className="text-sm text-gray-400">No happy hour is running.</p>}
      <form action={start} className="flex flex-wrap items-end gap-4">
        <fieldset className="fieldset">
          <legend className="fieldset-legend"><label htmlFor="hh-minutes">Minutes</label></legend>
          <input id="hh-minutes" name="minutes" type="number" min={1} max={HAPPY_MINUTES_MAX} step={1} defaultValue={30} required className={`${fieldClass} w-28`} />
        </fieldset>
        <fieldset className="fieldset">
          <legend className="fieldset-legend"><label htmlFor="hh-kind">Kind</label></legend>
          <select id="hh-kind" name="kind" value={kind} onChange={e => setKind(e.target.value as 'free' | 'discount')} className={fieldClass}>
            <option value="free">Free packs</option>
            <option value="discount">Discount</option>
          </select>
        </fieldset>
        {kind === 'discount' && (
          <fieldset className="fieldset">
            <legend className="fieldset-legend"><label htmlFor="hh-percent">Percent off</label></legend>
            <input id="hh-percent" name="percent" type="number" min={1} max={99} step={1} defaultValue={50} required className={`${fieldClass} w-28`} />
          </fieldset>
        )}
        <PendingButton pendingLabel="Starting..." className="btn btn-primary btn-sm">{running ? 'Replace happy hour' : 'Start happy hour'}</PendingButton>
      </form>
      {running && (
        <form action={end}>
          <PendingButton pendingLabel="Ending..." className="btn btn-sm btn-outline">End now</PendingButton>
        </form>
      )}
      {shown && <p role="status" className={`text-sm ${shown.ok ? 'text-green-300' : 'text-amber-200'}`}>{shown.message}</p>}
    </Panel>
  );
}
