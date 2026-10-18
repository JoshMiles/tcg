# app/admin/dashboard/actions.ts

- saveDashboardLayoutAction · function · L10-L16 — async function saveDashboardLayoutAction(layout: DashboardLayout): Promise<{ ok: true; layout: DashboardLayout }>
- saveDashboardNotesAction · function · L18-L21 — async function saveDashboardNotesAction(text: string): Promise<void>
- saveDashboardPresetAction · function · L24-L30 — async function saveDashboardPresetAction(name: string, layout: DashboardLayout): Promise<{ name: string; by?: string }[]>
- deleteDashboardPresetAction · function · L32-L36 — async function deleteDashboardPresetAction(name: string): Promise<{ name: string; by?: string }[]>
- applyDashboardPresetAction · function · L39-L46 — async function applyDashboardPresetAction(name: string): Promise<DashboardLayout>
- applyBuiltinPresetAction · function · L49-L56 — async function applyBuiltinPresetAction(name: string): Promise<DashboardLayout>
- setLiveGateAction · function · L59-L65 — async function setLiveGateAction(kind: 'packs' | 'collections', value: boolean): Promise<void>
