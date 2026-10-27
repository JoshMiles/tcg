'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CUSTOM_ICONS, CUSTOM_RULES, DETAIL_MAX, PLACEHOLDERS, TITLE_MAX, defaultIcon, defaultText, type CustomGoal, type CustomRuleType } from '@/lib/achievements';
import { describeBuffDef, type BuffDef } from '@/lib/buffs-core';
import { RARITIES } from '@/lib/rarity';
import { VARIANTS, VARIANT_LABELS } from '@/lib/variants';
import { Icon, type IconName } from '@/app/components/Icon';
import { Panel } from '../components/ui';
import { ConfirmButton } from '../components/ConfirmButton';

const GROUPS = ['Set', 'Rarity', 'Version', 'Edition number', 'Trading', 'Streams'] as const;

/** `{words}` that are not a known placeholder (they would show as typed). */
function unknownWords(text: string, extra: string[] = []): string[] {
  const known = new Set([...PLACEHOLDERS.map(p => p.word), ...extra]);
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]))].filter(w => !known.has(w));
}

function Warn({ text, extra }: { text: string; extra?: string[] }) {
  const bad = unknownWords(text, extra);
  if (bad.length === 0) return null;
  return <span className="block text-[11px] text-amber-400 mt-1">Not a placeholder, shown as typed: {bad.map(w => `{${w}}`).join(' ')}</span>;
}

/** A square tile: the icon, large, and the name. Clicking opens the editor next to it. */
function Tile({ icon, name, open, off, onClick }: { icon: IconName; name: string; open: boolean; off?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center min-h-[7rem] ${open ? 'border-primary bg-gray-800' : 'border-gray-800 hover:border-gray-600'} ${off ? 'opacity-50' : ''}`}>
      <Icon name={icon} className="w-9 h-9" />
      <span className="text-xs font-semibold text-white break-words w-full">{name}</span>
    </button>
  );
}

/** A grid of icon buttons; submits the chosen icon under `name`. */
function IconPicker({ name, value, onChange }: { name: string; value: IconName; onChange: (i: IconName) => void }) {
  return (
    <div className="text-xs text-gray-500">
      Icon
      <input type="hidden" name={name} value={value} />
      <div role="group" aria-label="Icon" className="flex flex-wrap gap-1 mt-1">
        {CUSTOM_ICONS.map(i => (
          <button key={i} type="button" aria-label={i} aria-pressed={i === value} onClick={() => onChange(i)}
            className={`btn btn-sm btn-square ${i === value ? 'btn-primary' : 'btn-ghost'}`}>
            <Icon name={i} />
          </button>
        ))}
      </div>
    </div>
  );
}

function BuffSelect({ name, value, buffs }: { name: string; value?: string; buffs: BuffDef[] }) {
  const available = buffs.filter(b => b.scope === 'self' && b.type !== 'grant-achievement');
  return (
    <label className="block text-xs text-gray-500">
      Buff given when earned
      <select name={name} defaultValue={value ?? ''} className="select select-sm w-full mt-1 bg-gray-900 border-gray-700 text-gray-200">
        <option value="">None</option>
        {available.map(b => <option key={b.id} value={b.id}>{b.name} ({describeBuffDef(b)})</option>)}
        {value && !available.some(b => b.id === value) && <option value={value} disabled>{value} (missing buff definition)</option>}
      </select>
      <span className="block mt-1">A buff from the <Link href="/admin/buffs" className="link">Buff Editor</Link>, given once, the first time a player earns this goal.</span>
    </label>
  );
}

function BuiltInRow({ kind, label, row, buffs, earned }: { kind: string; label: string; row: { on: boolean; title: string; detail: string; buffId?: string; icon?: IconName }; buffs: BuffDef[]; earned: number }) {
  const def = defaultText(kind);
  const [title, setTitle] = useState(row.title || def.title);
  const [detail, setDetail] = useState(row.detail || def.detail);
  const [icon, setIcon] = useState<IconName>(row.icon ?? defaultIcon(kind));
  const [open, setOpen] = useState(false);
  return (
    <>
    <Tile icon={icon} name={label} open={open} off={!row.on} onClick={() => setOpen(o => !o)} />
    <fieldset hidden={!open} className="col-span-full rounded-xl border border-gray-800 p-3 space-y-2 [&:not([hidden])]:block">
      <div className="flex items-center justify-between gap-2">
        <legend className="px-1 text-sm font-semibold text-white">{label}</legend>
        <span className="text-xs text-gray-500">Earned {earned}x</span>
        <label className="inline-flex items-center gap-2 text-sm text-gray-200">
          <input type="checkbox" role="switch" name={`on:${kind}`} value="on" defaultChecked={row.on} className="toggle toggle-sm toggle-primary" />
          On
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-gray-500">
          Title
          <input name={`title:${kind}`} value={title} onChange={e => setTitle(e.target.value)} maxLength={TITLE_MAX} className="input input-sm w-full mt-1" />
          <Warn text={title} />
        </label>
        <label className="block text-xs text-gray-500">
          Detail
          <input name={`detail:${kind}`} value={detail} onChange={e => setDetail(e.target.value)} maxLength={DETAIL_MAX} className="input input-sm w-full mt-1" />
          <Warn text={detail} />
        </label>
      </div>
      <button type="button" className="btn btn-xs btn-ghost" disabled={title === def.title && detail === def.detail} onClick={() => { setTitle(def.title); setDetail(def.detail); }}>
        <Icon name="redo" /> Reset to the default words
      </button>
      <IconPicker name={`icon:${kind}`} value={icon} onChange={setIcon} />
      <BuffSelect name={`buff:${kind}`} value={row.buffId} buffs={buffs} />
    </fieldset>
    </>
  );
}

/** One row per built-in kind, with the built-in words filled in. Saving words equal to the default stores nothing. */
export function AchievementsForm({ items, buffDefs, counts, save }: {
  items: { kind: string; label: string; group: string; row: { on: boolean; title: string; detail: string; buffId?: string; icon?: IconName } }[];
  buffDefs: BuffDef[];
  counts: Record<string, number>;
  save: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={save} className="space-y-4">
      {GROUPS.map(group => (
        <Panel key={group} title={group} icon="award">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {items.filter(k => k.group === group).map(k => (
              <BuiltInRow key={k.kind} kind={k.kind} label={k.label} row={k.row} buffs={buffDefs} earned={counts[k.kind] ?? 0} />
            ))}
          </div>
        </Panel>
      ))}
      <button type="submit" className="px-4 py-2 btn btn-primary rounded-xl text-sm">Save built-in goals</button>
    </form>
  );
}

/** A staff-made goal: edit an existing one (`goal` set) or make a new one. */
export function CustomGoalForm({ goal, buffDefs, earned, save, remove }: {
  goal?: CustomGoal;
  buffDefs: BuffDef[];
  earned?: number;
  save: (formData: FormData) => Promise<void>;
  remove?: (formData: FormData) => Promise<void>;
}) {
  const [rule, setRule] = useState<CustomRuleType>(goal?.rule.type ?? 'unique');
  const [title, setTitle] = useState(goal?.title ?? '');
  const [detail, setDetail] = useState(goal?.detail ?? '');
  const versions = VARIANTS.filter(v => v !== 'regular');
  const formId = `del-${goal?.id ?? 'new'}`;
  const [icon, setIcon] = useState<IconName>(goal?.icon ?? 'award');
  const [open, setOpen] = useState(false);
  return (
    <>
    <Tile icon={goal ? icon : 'plus'} name={goal ? goal.title : 'New goal'} open={open} off={goal ? !goal.on : false} onClick={() => setOpen(o => !o)} />
    <div hidden={!open} className="col-span-full rounded-xl border border-gray-800 p-3 space-y-2 [&:not([hidden])]:block">
      <form action={save} className="space-y-2">
        {goal && <input type="hidden" name="id" value={goal.id} />}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-white">{goal ? goal.title : 'New goal'}</span>
          {goal && <span className="text-xs text-gray-500">Earned {earned ?? 0}x</span>}
          <label className="inline-flex items-center gap-2 text-sm text-gray-200">
            <input type="checkbox" role="switch" name="on" value="on" defaultChecked={goal?.on ?? true} className="toggle toggle-sm toggle-primary" />
            On
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs text-gray-500">
            Title
            <input name="title" value={title} onChange={e => setTitle(e.target.value)} maxLength={TITLE_MAX} required className="input input-sm w-full mt-1" />
            <Warn text={title} extra={['n']} />
          </label>
          <label className="block text-xs text-gray-500">
            Detail
            <input name="detail" value={detail} onChange={e => setDetail(e.target.value)} maxLength={DETAIL_MAX} className="input input-sm w-full mt-1" />
            <Warn text={detail} extra={['n']} />
          </label>
        </div>
        <IconPicker name="icon" value={icon} onChange={setIcon} />
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="block text-xs text-gray-500 sm:col-span-2">
            Rule
            <select name="rule" value={rule} onChange={e => setRule(e.target.value as CustomRuleType)} className="select select-sm w-full mt-1 bg-gray-900 border-gray-700 text-gray-200">
              {Object.entries(CUSTOM_RULES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block text-xs text-gray-500">
            N
            <input name="n" type="number" min={1} max={1000} defaultValue={goal?.rule.n ?? 5} className="input input-sm w-full mt-1" />
          </label>
        </div>
        {rule === 'rarity' && (
          <label className="block text-xs text-gray-500">
            Rarity
            <select name="stars" defaultValue={goal?.rule.stars ?? RARITIES[0].stars} className="select select-sm w-full mt-1 bg-gray-900 border-gray-700 text-gray-200">
              {RARITIES.map(r => <option key={r.stars} value={r.stars}>{r.label}</option>)}
            </select>
          </label>
        )}
        {rule === 'version' && (
          <label className="block text-xs text-gray-500">
            Version
            <select name="variant" defaultValue={goal?.rule.variant ?? versions[0]} className="select select-sm w-full mt-1 bg-gray-900 border-gray-700 text-gray-200">
              {versions.map(v => <option key={v} value={v}>{VARIANT_LABELS[v]}</option>)}
            </select>
          </label>
        )}
        <BuffSelect name="buffId" value={goal?.buffId} buffs={buffDefs} />
        <div className="flex items-center gap-2">
          <button type="submit" className="btn btn-primary btn-sm rounded-xl">{goal ? 'Save goal' : 'Add goal'}</button>
          {goal && remove && (
            <ConfirmButton formId={formId} title="Delete this goal?" message="Players who already earned it keep it on their profile." confirmLabel="Delete" className="btn btn-sm btn-ghost text-red-400">Delete</ConfirmButton>
          )}
        </div>
      </form>
      {goal && remove && (
        <form id={formId} action={remove}><input type="hidden" name="id" value={goal.id} /></form>
      )}
    </div>
    </>
  );
}
