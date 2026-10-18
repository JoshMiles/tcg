# app/components/site/SiteNav.tsx

- NavUser · interface · L26-L26 — interface NavUser
- NavRank · interface · L28-L28 — interface NavRank
- readSeen · function · L32-L34 — function readSeen(username: string): { rank: number; score: number } | null
- TwitchGlyph · function · L36-L40 — TwitchGlyph = ()
- NavStaff · interface · L44-L44 — interface NavStaff
- SiteNav · function · L46-L227 — function SiteNav({ user, loginEnabled, rank, staff, label }: { label?: 'alpha' | 'beta' | null; user: NavUser | null; loginEnabled: boolean; rank?: NavRank | null; staff?: NavStaff | null })
- items · function · L58-L58 — items = ()
- onDown · function · L60-L60 — onDown = (e: MouseEvent)
- onKey · function · L61-L67 — onKey = (e: KeyboardEvent)
- onKey · function · L76-L76 — onKey = (e: KeyboardEvent)
- markSeen · function · L87-L91 — markSeen = ()
- isActive · function · L98-L98 — isActive = (href: string, exact?: boolean)
- RankChip · function · L230-L240 — function RankChip({ rank, delta }: { rank: NavRank; delta: number })
