# app/components/trade/TradeActions.tsx

- Action · type · L14-L14 — type Action = 'accept' | 'decline' | 'cancel';
- TradeActions · function · L17-L144 — function TradeActions({ tradeId, mode, canAccept = true, blocked, pick, }: { /** When the offer asks for cards you hold spare prints of, accepting first lets you choose which ones (newest by default). */ pick?: PickProps; tradeId: string; /** incoming: an offer made to you; outgoing: your own; board: someone's open listing; own: your own listing on the board (Take is greyed out, with a Withdraw). */ mode: 'incoming' | 'outgoing' | 'board' | 'own'; canAccept?: boolean; /** Why accepting isn't possible right now (e.g. "You need 2× Dinogidds"). */ blocked?: string; })
- arm · function · L43-L47 — function arm(action: Action)
- openPicker · function · L48-L63 — async function openPicker(p: PickProps)
- press · function · L64-L68 — function press(action: Action)
- run · function · L70-L86 — async function run(action: Action)
