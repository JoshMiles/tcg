# app/u/[username]/ProfileTabs.tsx

- ago · function · L23-L29 — ago = (at: number)
- Empty · function · L31-L37 — Empty = ({ icon, title, children }: { icon: Parameters<typeof Icon>[0]['name']; title: string; children?: React.ReactNode })
- CollectionTab · function · L40-L57 — function CollectionTab({ b, grid, isOwner, tradeWith, prefs, mine }: { b: ProfileBase; grid: GridCard[]; isOwner: boolean; tradeWith?: string; prefs?: { hideUncollected: boolean; compactGrids: boolean }; mine?: Record<number, number> })
- StatsTab · function · L60-L111 — async function StatsTab({ b }: { b: ProfileBase })
- TradesTab · function · L114-L140 — async function TradesTab({ b, viewer }: { b: ProfileBase; viewer?: string })
- nameOf · function · L120-L120 — nameOf = (n: number)
- ActivityTab · function · L143-L166 — async function ActivityTab({ b }: { b: ProfileBase })
- name · function · L149-L149 — name = (n: number, fallback?: string)
