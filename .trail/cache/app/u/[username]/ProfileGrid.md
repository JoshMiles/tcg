# app/u/[username]/ProfileGrid.tsx

- DragSource · type · L8-L8 — type DragSource = { type: ProfileWidgetType; fromLibrary: boolean };
- DropAt · type · L9-L9 — type DropAt = { type: ProfileWidgetType; after: boolean } | 'end' | null;
- ProfileGrid · function · L19-L192 — function ProfileGrid({ layout, nodes, isOwner }: { layout: ProfilePlacement[]; nodes: Partial<Record<ProfileWidgetType, ReactNode>>; isOwner: boolean })
- move · function · L35-L42 — move = (type: ProfileWidgetType, to: number)
- insert · function · L43-L43 — insert = (type: ProfileWidgetType, at: number)
- applyPreset · function · L44-L44 — applyPreset = (id: string)
- remove · function · L45-L45 — remove = (type: ProfileWidgetType)
- widen · function · L46-L50 — widen = (w: ProfilePlacement, dir: 1 | -1)
- dropOn · function · L52-L62 — function dropOn(target: DropAt)
- overWidget · function · L63-L69 — function overWidget(e: DragEvent, w: ProfilePlacement)
- run · function · L71-L80 — function run(fn: () => Promise<ProfilePlacement[]>, failure: string)
- save · function · L81-L81 — save = ()
- reset · function · L82-L82 — reset = ()
- cancel · function · L83-L83 — cancel = ()
- startResize · function · L86-L107 — function startResize(e: React.PointerEvent<HTMLElement>, w: ProfilePlacement)
- onMove · function · L97-L101 — onMove = (ev: PointerEvent)
- onUp · function · L102-L105 — onUp = ()
