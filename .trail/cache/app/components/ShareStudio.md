# app/components/ShareStudio.tsx

- Template · type · L7-L7 — type Template = 'cards' | 'stats';
- ShareStudio · function · L13-L154 — function ShareStudio({ base, candidates, bigStats, link, filename, shareText, defaultCount = 6, maxCards = 9 }: { base: ShareSpec; /** Cards the viewer can choose from, best first. Leave out when the image has a fixed card (a single copy). */ candidates?: ShareCard[]; /** Enables the "Stats poster" template. */ bigStats?: BigStat[]; link?: string; filename: string; shareText?: string; defaultCount?: number; maxCards?: number; })
- toggle · function · L53-L55 — function toggle(i: number)
- go · function · L56-L63 — async function go(kind: 'share' | 'download')
- copyLink · function · L64-L67 — async function copyLink()
- chip · function · L69-L69 — chip = (on: boolean)
