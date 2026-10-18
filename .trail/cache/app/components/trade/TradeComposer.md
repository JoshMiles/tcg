# app/components/trade/TradeComposer.tsx

- Holdings · type · L20-L20 — type Holdings = Record<number, Partial<Record<Variant, number>>>;
- TradeComposer · function · L29-L263 — function TradeComposer({ seasonId, cards, mine, minePool = {}, minePrints = {}, myWanted = [], maxStacks, expiryHours, initial, }: { seasonId: string; cards: TradeCardInfo[]; mine: Holdings; /** The serial numbers the viewer holds: trades move the newest first, so the offer is priced with those. */ minePool?: SerialPool; /** The exact prints the viewer holds (empty while the season's prints are not numbered: then there is nothing to choose). */ minePrints?: PrintPool; /** Cards on the viewer's own Looking for list. */ myWanted?: number[]; maxStacks: number; expiryHours: number; initial: { kind: 'direct' | 'listing'; to: string; give: TradeItem[]; get: TradeItem[]; counterOf?: string }; })
- lookUp · function · L63-L85 — async function lookUp(pick?: string)
- taken · function · L93-L93 — taken = (list: TradeItem[], n: number, v: Variant)
- giveAvail · function · L94-L94 — giveAvail = (n: number, v: Variant)
- getAvail · function · L95-L98 — getAvail = (n: number, v: Variant)
- add · function · L102-L107 — add = (list: TradeItem[], set: (l: TradeItem[]) => void, avail: (n: number, v: Variant) => number, n: number, v: Variant, prints?: PrintPool)
- adjust · function · L108-L112 — adjust = (list: TradeItem[], set: (l: TradeItem[]) => void, avail: (n: number, v: Variant) => number, item: TradeItem, delta: number, prints?: PrintPool)
- setIds · function · L114-L116 — setIds = (list: TradeItem[], set: (l: TradeItem[]) => void, item: TradeItem, ids: string[] | undefined)
- bestOwned · function · L126-L126 — bestOwned = (n: number): Variant | null
- bestTheirs · function · L129-L129 — bestTheirs = (n: number): Variant | null
- send · function · L131-L147 — async function send()
- Side · function · L266-L356 — function Side({ title, hint, cards, items, avail, byNumber, onAdd, onAdjust, points, maxStacks, empty, spareOf, pool, prints, onIds, giving = false, }: { /** The prints that could be ticked for each stack (absent or empty: nothing to choose). */ prints?: PrintPool; onIds?: (item: TradeItem, ids: string[] | undefined) => void; /** These prints leave the viewer (warn about prints worth keeping). */ giving?: boolean; /** The serial numbers these stacks would come from (the newest move first), shown on each stack. */ pool?: SerialPool; title: string; hint: string; cards: TradeCardInfo[]; items: TradeItem[]; avail: (n: number, v: Variant) => number; byNumber: Record<number, TradeCardInfo>; onAdd: (n: number, v: Variant) => void; onAdjust: (item: TradeItem, delta: number) => void; points: number; maxStacks: number; empty: string; /** When given, a "Spares only" filter appears: cards with two or more copies of some version. */ spareOf?: (c: TradeCardInfo) => boolean; })
- withIds · function · L359-L363 — function withIds(item: TradeItem, ids: string[] | undefined): TradeItem
- resized · function · L366-L371 — function resized(item: TradeItem, count: number, prints?: PrintPool): TradeItem
