'use client';
import { Icon } from '@/app/components/Icon';
import type { SaveState } from './use-autosave';

export interface StepDef { id: string; label: string }

/** Clickable step bar for the wizards. `locked` steps can't be visited yet (nothing saved to resume). */
export function Stepper({
  steps, current, onSelect, locked = false, issuesByStep = {},
}: {
  steps: StepDef[];
  current: string;
  onSelect: (id: string) => void;
  locked?: boolean;
  /** Number of problems per step id, shown as a red dot once the user has moved past that step. */
  issuesByStep?: Record<string, number>;
}) {
  const currentIdx = steps.findIndex(s => s.id === current);
  return (
    <nav aria-label="Steps" className="flex items-center gap-0 overflow-x-auto pb-1">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const isCurrent = i === currentIdx;
        const disabled = locked && i > 0;
        const issues = issuesByStep[s.id] ?? 0;
        return (
          <div key={s.id} className="flex items-center flex-1 last:flex-none min-w-0">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(s.id)}
              aria-current={isCurrent ? 'step' : undefined}
              className="flex items-center gap-2 shrink-0 group disabled:cursor-not-allowed"
            >
              <span className={`relative w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                done ? 'bg-yellow-500 text-gray-950'
                : isCurrent ? 'bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500/60'
                : 'bg-gray-800 text-gray-600'
              }`}>
                {done ? <Icon name="check" className="w-3.5 h-3.5" /> : i + 1}
                {issues > 0 && done && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-gray-950" title={`${issues} to fix`} />}
              </span>
              <span className={`text-sm font-medium transition-colors ${isCurrent ? 'text-white' : done ? 'text-gray-400 group-hover:text-white' : 'text-gray-600'}`}>
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span className={`flex-1 h-px mx-3 min-w-4 transition-colors ${done ? 'bg-yellow-500/40' : 'bg-gray-800'}`} />
            )}
          </div>
        );
      })}
    </nav>
  );
}

const SAVE_LABEL: Record<SaveState, { text: string; cls: string }> = {
  idle:   { text: 'Draft', cls: 'text-gray-500' },
  dirty:  { text: 'Unsaved changes…', cls: 'text-gray-400' },
  saving: { text: 'Saving…', cls: 'text-yellow-400' },
  saved:  { text: 'Draft saved', cls: 'text-green-400' },
  error:  { text: 'Couldn\'t save', cls: 'text-red-400' },
};

export function SaveIndicator({ state, error, hasDraft }: { state: SaveState; error?: string; hasDraft: boolean }) {
  if (!hasDraft) return <span className="text-xs text-gray-600">Not saved yet</span>;
  const { text, cls } = SAVE_LABEL[state];
  return <span className={`text-xs font-semibold ${cls}`} title={error || undefined} role="status">{text}{state === 'error' && error ? `, ${error}` : ''}</span>;
}

/** Combines two autosave states into the one shown to the user. */
export function worstState(a: SaveState, b: SaveState): SaveState {
  const order: SaveState[] = ['error', 'saving', 'dirty', 'saved', 'idle'];
  return order.find(s => s === a || s === b) ?? 'idle';
}
