'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import {
  BUFF_ACHIEVEMENT_KINDS,
  BUFF_NAME_MAX,
  BUFF_TYPE_LABELS,
  BUFF_TYPES,
  DURATION_UNIT_LABELS,
  DURATION_UNITS,
  HOURS_MAX,
  HOURS_MIN,
  MAGNITUDE_MAX,
  MAGNITUDE_MIN,
  POINTS_DEFAULT,
  POINTS_MAX,
  POINTS_MIN,
  PULLS_MAX,
  PULLS_MIN,
  STREAMS_MAX,
  STREAMS_MIN,
  describeBuffDef,
  isInstantBuffType,
  type BuffDef,
  type BuffScope,
  type BuffStackMode,
  type BuffType,
  type BuffUsage,
  type DurationUnit,
} from '@/lib/buffs-core';
import { ArmedButton } from '@/app/components/ArmedButton';
import { Chip, EmptyState, Panel, fieldClass, selectClass } from '../components/ui';
import { createBuffAction, deleteBuffAction, retryGrantAction, updateBuffAction } from '../buff-actions';

interface FormState {
  name: string;
  type: BuffType;
  magnitude: number;
  durationUnit: DurationUnit;
  durationN: number;
  stack: BuffStackMode;
  scope: BuffScope;
  achievementId: string;
  points: number;
  streamDeck: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  type: 'extra-pulls',
  magnitude: 2,
  durationUnit: 'streams',
  durationN: 1,
  stack: 'refresh',
  scope: 'self',
  achievementId: BUFF_ACHIEVEMENT_KINDS[0].kind,
  points: POINTS_DEFAULT,
  streamDeck: false,
};

// One-click starting points: they only fill the form, nothing is saved until Create buff.
const PRESETS: { label: string; form: Partial<FormState> }[] = [
  { label: 'Free bonus pack (self)', form: { name: 'Free bonus pack', type: 'extra-pack', magnitude: 1, scope: 'self', durationUnit: 'season' } },
  { label: 'Everyone +1 pull', form: { name: 'Everyone gets an extra pull', type: 'extra-pulls', magnitude: 1, scope: 'community', durationUnit: 'streams', durationN: 1 } },
  { label: 'Rarer pulls', form: { name: 'Rarer pulls', type: 'rarity-boost', magnitude: 5, scope: 'self', durationUnit: 'pulls', durationN: 5 } },
  { label: '+100 leaderboard points', form: { name: 'Bonus +100 points', type: 'score-bonus', points: 100, scope: 'self' } },
  { label: 'Brie Bucks for all', form: { name: 'Bonus Brie Bucks for all', type: 'currency-grant', points: 100, scope: 'community' } },
];

function defToForm(def: BuffDef): FormState {
  return {
    name: def.name,
    type: def.type,
    magnitude: def.magnitude,
    durationUnit: def.duration.unit,
    durationN: def.duration.n ?? (def.duration.unit === 'hours' ? 24 : 1),
    stack: def.stack,
    scope: def.type === 'grant-achievement' ? 'self' : def.scope,
    achievementId: def.achievementId ?? BUFF_ACHIEVEMENT_KINDS[0].kind,
    points: def.points ?? POINTS_DEFAULT,
    streamDeck: !!def.streamDeck,
  };
}

export function BuffEditorClient({
  buffs,
  usages,
  mixItUpReady,
  openGrants,
}: {
  buffs: BuffDef[];
  usages: Record<string, BuffUsage>;
  /** Mix It Up is on and has an add address (needed by the Bonus Brie Bucks buff). */
  mixItUpReady: boolean;
  /** Brie Bucks grants with viewers still unpaid. */
  openGrants: { id: string; name: string; amount: number; unpaid: number; total: number }[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
    setNotice('');
  }

  function startEdit(def: BuffDef) {
    setEditingId(def.id);
    setForm(defToForm(def));
    setError('');
    setNotice('');
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    startTransition(async () => {
      const payload = {
        name: form.name,
        type: form.type,
        magnitude: form.magnitude,
        duration: { unit: form.durationUnit, n: form.durationN },
        stack: form.stack,
        scope: form.type === 'grant-achievement' ? 'self' : form.scope,
        achievementId: form.achievementId,
        points: form.points,
        streamDeck: form.type !== 'grant-achievement' && form.streamDeck,
      };
      const res = editingId ? await updateBuffAction(editingId, payload) : await createBuffAction(payload);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      if (editingId) {
        setNotice(`Saved "${res.def?.name ?? form.name}".`);
      } else {
        setForm(EMPTY_FORM);
        setNotice(`Created "${res.def?.name ?? form.name}".`);
      }
    });
  }

  function onDelete(def: BuffDef) {
    setError('');
    setNotice('');
    startTransition(async () => {
      const res = await deleteBuffAction(def.id);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      if (editingId === def.id) {
        setEditingId(null);
        setForm(EMPTY_FORM);
      }
      setNotice(`Deleted "${def.name}".`);
    });
  }

  const isGrantAch = form.type === 'grant-achievement';
  const isInstant = isInstantBuffType(form.type);
  const durationCap = form.durationUnit === 'hours'
    ? { min: HOURS_MIN, max: HOURS_MAX, label: `Hours (${HOURS_MIN} to ${HOURS_MAX})` }
    : form.durationUnit === 'streams'
      ? { min: STREAMS_MIN, max: STREAMS_MAX, label: `Streams (${STREAMS_MIN} to ${STREAMS_MAX})` }
      : { min: PULLS_MIN, max: PULLS_MAX, label: `Pulls (${PULLS_MIN} to ${PULLS_MAX})` };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_26rem] gap-6 items-start">
      <div className="space-y-4">
        {error && (
          <div role="alert" className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
            <Icon name="warning" className="text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200 flex items-center gap-2">
            <Icon name="checkCircle" className="text-emerald-400 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {openGrants.length > 0 && (
          <Panel title="Unpaid Brie Bucks" icon="warning" hint="Retry pays only the viewers not marked paid, so nobody is paid twice.">
            <ul className="divide-y divide-gray-800/70">
              {openGrants.map(g => (
                <li key={g.id} className="py-2 flex items-center justify-between gap-3 text-sm text-gray-200">
                  <span>{g.name}: {g.unpaid} of {g.total} unpaid ({g.amount.toLocaleString('en-US')} each)</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => { setError(''); setNotice(''); startTransition(async () => { const r = await retryGrantAction(g.id); if (r.ok) setNotice('Everyone is paid.'); else setError(r.message); }); }}
                    className="btn btn-xs border border-gray-700 bg-gray-900 text-gray-200 hover:border-gray-500"
                  >
                    Retry unpaid
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {buffs.length === 0 ? (
          <EmptyState icon="zap" title="No buffs defined yet">
            Create a buff on the right, then assign it to a Trainer card in the Pack Workspace.
          </EmptyState>
        ) : (
          <Panel title={`Buff catalogue (${buffs.length})`} icon="zap" hint="Assign a buff to a Trainer card in the Pack Workspace. A buff in use by a card or achievement cannot be deleted.">
            <ul className="divide-y divide-gray-800/70">
              {buffs.map(b => {
                const u = usages[b.id] ?? { cards: [], achievements: [] };
                const inUseCount = u.cards.length + u.achievements.length;
                const isEditing = editingId === b.id;
                return (
                  <li key={b.id} className={`py-3.5 first:pt-1 last:pb-1 flex flex-wrap items-start justify-between gap-3 ${isEditing ? 'bg-yellow-500/5 -mx-3 px-3 rounded-xl' : ''}`}>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white text-sm">{b.name}</span>
                        <Chip tone={b.scope === 'community' ? 'purple' : 'amber'}>{b.scope === 'community' ? 'Community' : 'Personal'}</Chip>
                        <Chip tone="gray">{BUFF_TYPE_LABELS[b.type]}</Chip>
                        <Chip tone="gray">Stack: {b.stack}</Chip>
                        {b.streamDeck && <Chip tone="gray">Stream Deck</Chip>}
                      </div>
                      <p className="text-xs text-gray-400">{describeBuffDef(b)}</p>
                      {inUseCount > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-gray-400">
                          <span className="text-gray-500">Used by:</span>
                          {u.cards.map(c => (
                            <Link
                              key={`${c.packId}:${c.cardId}`}
                              href={`/admin/packs/${c.packId}?card=${c.cardId}`}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-800 bg-gray-900/70 px-2 py-0.5 text-xs text-yellow-300 hover:border-yellow-500/40"
                            >
                              <Icon name="cards" className="w-3 h-3" />
                              #{c.cardNumber} {c.cardName || 'Untitled'} ({c.packName})
                            </Link>
                          ))}
                          {u.achievements.map(a => (
                            <Link
                              key={a.kind}
                              href="/admin/achievements"
                              className="inline-flex items-center gap-1 rounded-md border border-gray-800 bg-gray-900/70 px-2 py-0.5 text-xs text-amber-300 hover:border-amber-500/40"
                            >
                              <Icon name="trophy" className="w-3 h-3" />
                              {a.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(b)}
                        disabled={pending}
                        className="btn btn-xs border border-gray-700 bg-gray-900 text-gray-200 hover:border-gray-500"
                      >
                        <Icon name="pencil" className="mr-1" />Edit
                      </button>
                      <ArmedButton
                        onConfirm={() => onDelete(b)}
                        disabled={pending || inUseCount > 0}
                        title={inUseCount > 0 ? 'Remove this buff from all trainer cards and achievements before deleting' : 'Delete buff'}
                        className="btn btn-xs border border-red-500/30 bg-red-950/20 text-red-300 hover:bg-red-950/40 disabled:opacity-40"
                      >
                        <Icon name="trash" className="mr-1" />Delete
                      </ArmedButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
      </div>

      <Panel
        title={editingId ? 'Edit buff' : 'New buff'}
        icon={editingId ? 'pencil' : 'plus'}
        hint={editingId ? 'Changes apply to every Trainer card that uses this buff.' : 'Define a reusable buff for Trainer cards and achievement bonuses.'}
        actions={editingId ? (
          <button type="button" onClick={startCreate} className="text-xs font-semibold text-gray-400 hover:text-white">
            Cancel edit
          </button>
        ) : undefined}
      >
        <form onSubmit={onSubmit} className="space-y-3">
          {!editingId && (
            <div className="flex flex-wrap gap-1.5" aria-label="Start from an example">
              {PRESETS.map(p => (
                <button key={p.label} type="button" onClick={() => setForm({ ...EMPTY_FORM, ...p.form })} className="btn btn-xs border border-gray-700 bg-gray-900 text-gray-200 hover:border-gray-500">
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <fieldset className="fieldset">
            <legend className="fieldset-legend"><label htmlFor="buff-name">Name</label></legend>
            <input
              id="buff-name"
              type="text"
              required
              maxLength={BUFF_NAME_MAX}
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Cheese Rush (+2 pulls)"
              className={fieldClass}
            />
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend"><label htmlFor="buff-type">Buff type</label></legend>
            <select
              id="buff-type"
              value={form.type}
              onChange={e => {
                const nextType = e.target.value as BuffType;
                setForm(f => ({
                  ...f,
                  type: nextType,
                  scope: nextType === 'grant-achievement' ? 'self' : f.scope,
                }));
              }}
              className={`${selectClass} w-full`}
            >
              {/* grant-achievement cannot be applied yet (applyBuff refuses it), so it is only listed for a buff already saved with it */}
              {BUFF_TYPES.filter(t => t !== 'grant-achievement' || form.type === t).map(t => (
                <option key={t} value={t}>{BUFF_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <p className="fieldset-label">
              {form.type === 'extra-pulls' && 'Raises per-stream pull limit by the magnitude while active. A base limit of 0 still means no limit.'}
              {form.type === 'extra-pack' && 'Grants pack credits. One credit is used instead of counting against the stream limit and waives the Brie Bucks cost for that pull.'}
              {form.type === 'rarity-boost' && 'Raises the draw weight of every rarity with 3 or more stars by 10% per magnitude point. Other rarities keep their weight, so their share drops.'}
              {form.type === 'score-bonus' && 'Adds flat leaderboard points once, when applied: to the holder (self) or everyone in stream chat (community, needs the Mix It Up chat viewers address). Duration does not apply.'}
              {form.type === 'currency-grant' && 'Adds Brie Bucks once, when applied, through the Mix It Up add address: to the holder (self) or everyone in stream chat (community, needs the chat viewers address). Unpaid viewers can be retried. Duration does not apply.'}
              {form.type === 'grant-achievement' && 'Awards one built-in achievement permanently. Always personal (self), with no duration.'}
            </p>
          </fieldset>

          {form.type === 'currency-grant' && !mixItUpReady && (
            <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
              Mix It Up is off or has no add address, so this buff cannot be applied yet (community scope also needs the chat viewers address). Set it up on the <Link href="/admin/mixitup" className="underline">Mix It Up page</Link>.
            </p>
          )}

          {isGrantAch ? (
            <fieldset className="fieldset">
              <legend className="fieldset-legend"><label htmlFor="buff-ach">Achievement to grant</label></legend>
              <select
                id="buff-ach"
                value={form.achievementId}
                onChange={e => setForm(f => ({ ...f, achievementId: e.target.value }))}
                className={`${selectClass} w-full`}
              >
                {BUFF_ACHIEVEMENT_KINDS.map(k => (
                  <option key={k.kind} value={k.kind}>{k.label} ({k.group})</option>
                ))}
              </select>
            </fieldset>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <fieldset className="fieldset">
                  {isInstant ? (
                    <>
                      <legend className="fieldset-legend"><label htmlFor="buff-points">{form.type === 'score-bonus' ? 'Points' : 'Brie Bucks'} ({POINTS_MIN} to {POINTS_MAX.toLocaleString('en-US')})</label></legend>
                      <input
                        id="buff-points"
                        type="number"
                        min={POINTS_MIN}
                        max={POINTS_MAX}
                        step={1}
                        value={form.points}
                        onChange={e => setForm(f => ({ ...f, points: Number(e.target.value) }))}
                        className={fieldClass}
                      />
                    </>
                  ) : (
                    <>
                      <legend className="fieldset-legend"><label htmlFor="buff-mag">{form.type === 'extra-pack' ? 'Pack credits (1 to 10)' : form.type === 'rarity-boost' ? 'Boost (1 to 10, +10% each)' : 'Extra pulls (1 to 10)'}</label></legend>
                      <input
                        id="buff-mag"
                        type="number"
                        min={MAGNITUDE_MIN}
                        max={MAGNITUDE_MAX}
                        step={1}
                        value={form.magnitude}
                        onChange={e => setForm(f => ({ ...f, magnitude: Number(e.target.value) }))}
                        className={fieldClass}
                      />
                    </>
                  )}
                </fieldset>

                <fieldset className="fieldset">
                  <legend className="fieldset-legend"><label htmlFor="buff-scope">Scope</label></legend>
                  <select
                    id="buff-scope"
                    value={form.scope}
                    onChange={e => setForm(f => ({ ...f, scope: e.target.value as BuffScope }))}
                    className={`${selectClass} w-full`}
                  >
                    <option value="self">Holder only (self)</option>
                    <option value="community">Every viewer (community)</option>
                  </select>
                </fieldset>
              </div>

              {!isInstant && <div className="grid grid-cols-2 gap-3">
                <fieldset className="fieldset">
                  <legend className="fieldset-legend"><label htmlFor="buff-dur-unit">Duration</label></legend>
                  <select
                    id="buff-dur-unit"
                    value={form.durationUnit}
                    onChange={e => setForm(f => ({ ...f, durationUnit: e.target.value as DurationUnit }))}
                    className={`${selectClass} w-full`}
                  >
                    {DURATION_UNITS.map(u => (
                      <option key={u} value={u}>{DURATION_UNIT_LABELS[u]}</option>
                    ))}
                  </select>
                </fieldset>

                {form.durationUnit !== 'season' && (
                  <fieldset className="fieldset">
                    <legend className="fieldset-legend"><label htmlFor="buff-dur-n">{durationCap.label}</label></legend>
                    <input
                      id="buff-dur-n"
                      type="number"
                      min={durationCap.min}
                      max={durationCap.max}
                      step={1}
                      value={form.durationN}
                      onChange={e => setForm(f => ({ ...f, durationN: Number(e.target.value) }))}
                      className={fieldClass}
                    />
                  </fieldset>
                )}
              </div>}
            </>
          )}

          {!isInstant && <fieldset className="fieldset">
            <legend className="fieldset-legend"><label htmlFor="buff-stack">When used while already active (stacking)</label></legend>
            <select
              id="buff-stack"
              value={form.stack}
              onChange={e => setForm(f => ({ ...f, stack: e.target.value as BuffStackMode }))}
              className={`${selectClass} w-full`}
            >
              <option value="refresh">Refresh expiry (keep magnitude, reset timer/count)</option>
              <option value="reject">Reject use while active (keep the card)</option>
            </select>
          </fieldset>}

          {form.type !== 'grant-achievement' && (
            <label className="flex items-start gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" className="checkbox checkbox-sm mt-0.5" checked={form.streamDeck} onChange={e => setForm(f => ({ ...f, streamDeck: e.target.checked }))} />
              <span>Stream Deck: let a Mix It Up button apply this buff (Mix It Up page, Stream Deck tab). Off, the buff answers nothing.</span>
            </label>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            {editingId && (
              <button type="button" onClick={startCreate} className="btn btn-sm border border-gray-700 bg-gray-900 text-gray-300">
                New buff instead
              </button>
            )}
            <button type="submit" disabled={pending || !form.name.trim()} className="btn btn-primary btn-sm px-4">
              {pending ? 'Saving…' : editingId ? 'Save changes' : 'Create buff'}
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
