# app/admin/components/Stepper.tsx

- StepDef · interface · L5-L5 — interface StepDef
- Stepper · function · L8-L55 — function Stepper({ steps, current, onSelect, locked = false, issuesByStep = {}, }: { steps: StepDef[]; current: string; onSelect: (id: string) => void; locked?: boolean; /** Number of problems per step id, shown as a red dot once the user has moved past that step. */ issuesByStep?: Record<string, number>; })
- SaveIndicator · function · L65-L69 — function SaveIndicator({ state, error, hasDraft }: { state: SaveState; error?: string; hasDraft: boolean })
- worstState · function · L72-L75 — function worstState(a: SaveState, b: SaveState): SaveState
