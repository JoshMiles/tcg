# app/u/[username]/widgets.tsx

- WidgetCtx · interface · L40-L50 — interface WidgetCtx
- ago · function · L52-L58 — ago = (at: number)
- Box · function · L60-L71 — function Box({ type, children, href, linkLabel }: { type: ProfileWidgetType; children: ReactNode; href?: string; linkLabel?: string })
- Hint · function · L73-L73 — Hint = ({ children }: { children: ReactNode })
- loadWidgetData · function · L76-L92 — async function loadWidgetData(types: ProfileWidgetType[], b: ProfileBase): Promise<Pick<WidgetCtx, 'events' | 'trades' | 'achievements'>>
- has · function · L77-L77 — has = (t: ProfileWidgetType)
- renderProfileWidget · function · L94-L458 — async function renderProfileWidget(type: ProfileWidgetType, ctx: WidgetCtx): Promise<ReactNode>
- none · function · L96-L96 — none = (msg: ReactNode)
- chanceOf · function · L231-L237 — chanceOf = (card: number, variant: Copy['variant'])
- name · function · L341-L341 — name = (n: number, fb?: string)
