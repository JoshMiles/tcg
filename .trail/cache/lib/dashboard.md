# lib/dashboard.ts

- WidgetType · type · L11-L11 — type WidgetType = (typeof WIDGET_TYPES)[number];
- Span · type · L15-L15 — type Span = (typeof SPANS)[number];
- WidgetDef · interface · L17-L25 — interface WidgetDef
- WidgetPlacement · interface · L56-L59 — interface WidgetPlacement
- DashboardLayout · interface · L61-L63 — interface DashboardLayout
- isType · function · L83-L83 — isType = (t: unknown): t is WidgetType
- sanitizeLayout · function · L86-L100 — function sanitizeLayout(input: unknown): DashboardLayout
- loginForLayout · function · L112-L114 — function loginForLayout(who: { login: string; via: 'twitch' | 'password' } | null): string | null
