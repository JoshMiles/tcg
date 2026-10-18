# lib/sandbox-scenarios.ts

- ScenarioId · type · L11-L11 — type ScenarioId = 'upgrade-ready' | 'nearly-complete' | 'complete-set' | 'trade-pair' | 'shiny-showcase' | 'crowd';
- ScenarioInfo · interface · L13-L13 — interface ScenarioInfo
- PlanContext · interface · L24-L24 — interface PlanContext
- Grant · interface · L25-L25 — interface Grant
- Plan · type · L26-L26 — type Plan = { ok: true; grants: Grant[]; note: string } | { ok: false; error: string };
- copies · function · L28-L28 — copies = (n: number, count: number, variant: Parameters<typeof encodeEntry>[1] = 'regular')
- planScenario · function · L30-L75 — function planScenario(id: Exclude<ScenarioId, 'crowd'>, ctx: PlanContext): Plan
- dupes · function · L60-L60 — dupes = (list: number[])
- applyScenario · function · L78-L99 — function applyScenario(sandboxId: string | null, id: ScenarioId): Promise<{ note: string; users: string[] }>
