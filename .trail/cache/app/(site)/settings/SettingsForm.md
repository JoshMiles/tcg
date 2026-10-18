# app/(site)/settings/SettingsForm.tsx

- BoolKey · type · L14-L14 — type BoolKey = 'privateProfile' | 'notifyOffers' | 'notifyResults' | 'notifyWatch' | 'notifyFeedback' | 'noticeSound' | 'allowOffers' | 'hideStaffBadge' | 'hideUncollected' | 'compactGrids';
- Section · function · L16-L26 — function Section({ icon, title, hint, children }: { icon: Parameters<typeof Icon>[0]['name']; title: string; hint?: string; children: ReactNode })
- Row · function · L28-L38 — function Row({ label, help, checked, onChange, id }: { label: string; help: string; checked: boolean; onChange: (v: boolean) => void; id: string })
- SettingsForm · function · L40-L196 — function SettingsForm({ initial, username, cards, isStaff = false }: { initial: UserSettings; username: string; isStaff?: boolean; cards: { number: number; name: string; stars: number }[] })
- toggleWanted · function · L46-L46 — toggleWanted = (n: number)
- nameOf · function · L48-L48 — nameOf = (n: number)
- addWatch · function · L54-L54 — addWatch = (card: number)
- removeWatch · function · L55-L55 — removeWatch = (i: number)
- flip · function · L57-L57 — flip = (k: BoolKey)
- toggleExp · function · L58-L58 — toggleExp = (id: string, on: boolean)
- save · function · L60-L73 — async function save()
