# lib/draw.ts

- ticketKey · function · L11-L11 — ticketKey = (id: string)
- DrawResult · interface · L13-L13 — interface DrawResult
- rollDraw · function · L16-L41 — function rollDraw(packs: { pack: Pack; cards: Card[] }[], rng: () => number = Math.random): DrawResult | null
- weight · function · L33-L33 — weight = (v: Variant)
- DrawTicket · interface · L43-L56 — interface DrawTicket
- QueuedDraw · interface · L59-L59 — interface QueuedDraw
- issueDraw · function · L62-L73 — async function issueDraw(id: string, username: string, paid = false): Promise<QueuedDraw | null>
- claimDraw · function · L76-L80 — async function claimDraw(id: string, username: string): Promise<DrawTicket | null>
- dropDraw · function · L83-L85 — async function dropDraw(id: string): Promise<void>
