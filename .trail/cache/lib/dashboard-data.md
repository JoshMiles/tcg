# lib/dashboard-data.ts

- layoutKeyFor · function · L38-L41 — function layoutKeyFor(login: string | null): string
- getDashboardLayout · function · L44-L51 — async function getDashboardLayout(login: string | null = null): Promise<DashboardLayout>
- saveDashboardLayout · function · L53-L55 — async function saveDashboardLayout(layout: DashboardLayout, login: string | null = null): Promise<void>
- resetDashboardLayout · function · L57-L59 — async function resetDashboardLayout(login: string | null = null): Promise<void>
- getDashboardNotes · function · L61-L63 — async function getDashboardNotes(): Promise<string>
- saveDashboardNotes · function · L65-L67 — async function saveDashboardNotes(text: string): Promise<void>
- AttentionItem · interface · L69-L75 — interface AttentionItem
- computeAttention · function · L78-L111 — async function computeAttention(season: Season, packs: { pack: Pack; cards: Card[] }[], live: LiveStatus | null, overlay: OverlayStatus | null, collectionBytes: number): Promise<AttentionItem[]>
- DashboardData · interface · L113-L145 — interface DashboardData
- loadDashboardData · function · L147-L223 — async function loadDashboardData(season: Season, packs: { pack: Pack; cards: Card[] }[], needs: Set<WidgetType>, range: Range['id'] = '7d'): Promise<DashboardData>
- DashboardPreset · interface · L227-L227 — interface DashboardPreset
- getDashboardPresets · function · L230-L237 — async function getDashboardPresets(): Promise<DashboardPreset[]>
- saveDashboardPreset · function · L239-L242 — async function saveDashboardPreset(name: string, layout: DashboardLayout, by?: string): Promise<void>
- deleteDashboardPreset · function · L244-L246 — async function deleteDashboardPreset(name: string): Promise<void>
