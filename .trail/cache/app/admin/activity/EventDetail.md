# app/admin/activity/EventDetail.tsx

- Outcome · type · L15-L15 — type Outcome = { ok: boolean; message: string } | null;
- EventDetail · function · L18-L162 — function EventDetail({ event: e, avatar, card, totalCards, cardName, onClose, onFilterViewer, mod = false }: { event: ActivityEvent; avatar?: string; card?: CardInfo; totalCards: number; cardName: CardNamer; onClose: () => void; onFilterViewer: (username: string) => void; /** Read-only for mods: the gift, grant and remove buttons are left out and the viewer link opens the mod panel. */ mod?: boolean; })
- onKey · function · L34-L34 — onKey = (ev: KeyboardEvent)
- run · function · L47-L49 — run = (fn: () => Promise<Outcome>)
- gift · function · L50-L54 — gift = ()
- grantAgain · function · L55-L59 — grantAgain = ()
- removeCopy · function · L60-L63 — removeCopy = ()
