# lib/profile-widgets.ts

- ProfileWidgetType · type · L8-L8 — type ProfileWidgetType = (typeof PROFILE_WIDGET_TYPES)[number];
- ProfileSpan · type · L12-L12 — type ProfileSpan = (typeof PROFILE_SPANS)[number];
- ProfileWidgetDef · interface · L14-L21 — interface ProfileWidgetDef
- ProfilePlacement · interface · L39-L39 — interface ProfilePlacement
- ProfilePreset · interface · L53-L53 — interface ProfilePreset
- isType · function · L69-L69 — isType = (t: unknown): t is ProfileWidgetType
- sanitizeProfileLayout · function · L72-L85 — function sanitizeProfileLayout(input: unknown): ProfilePlacement[]
- withPinnedWidget · function · L96-L99 — function withPinnedWidget(layout: ProfilePlacement[] | null): ProfilePlacement[]
