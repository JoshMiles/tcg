# app/admin/trade-actions.ts

- TradeActionResult · interface · L14-L14 — interface TradeActionResult
- saveTradeSettingsAction · function · L16-L31 — async function saveTradeSettingsAction(formData: FormData)
- adminCancelTradeAction · function · L34-L39 — async function adminCancelTradeAction(id: string)
- cancelOpenTradesAction · function · L42-L49 — async function cancelOpenTradesAction(scope: { username?: string; seasonId?: string }): Promise<TradeActionResult>
- extendOpenTradesAction · function · L52-L57 — async function extendOpenTradesAction(hours: number, ids: string[] | null = null): Promise<TradeActionResult>
- setSeasonTradingAction · function · L60-L70 — async function setSeasonTradingAction(seasonId: string, frozen: boolean): Promise<TradeActionResult>
- blockViewerTradingAction · function · L73-L83 — async function blockViewerTradingAction(username: string, reason: string): Promise<TradeActionResult>
- cancelOneTradeAction · function · L86-L92 — async function cancelOneTradeAction(id: string): Promise<TradeActionResult>
- reverseTradeAction · function · L95-L106 — async function reverseTradeAction(id: string, reason: string): Promise<TradeActionResult>
