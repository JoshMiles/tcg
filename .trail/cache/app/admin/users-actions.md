# app/admin/users-actions.ts

- UserActionResult · interface · L15-L15 — interface UserActionResult
- revalidate · function · L17-L21 — revalidate = (username?: string)
- saveTagsAction · function · L24-L29 — async function saveTagsAction(username: string, tags: string[]): Promise<string[]>
- saveFlagsAction · function · L31-L37 — async function saveFlagsAction(username: string, flags: { noTrading: boolean; hideFromBoard: boolean; reason: string }): Promise<UserActionResult>
- grantManyAction · function · L40-L61 — async function grantManyAction(username: string, cardNumbers: number[], variant: string, copies: number): Promise<UserActionResult>
- giftPacksAction · function · L63-L73 — async function giftPacksAction(username: string, count: number, force = false): Promise<UserActionResult>
- restoreSnapshotAction · function · L75-L80 — async function restoreSnapshotAction(username: string, id: string): Promise<UserActionResult>
- mergeUserAction · function · L82-L88 — async function mergeUserAction(from: string, into: string): Promise<UserActionResult>
- cancelUserTradeAction · function · L91-L98 — async function cancelUserTradeAction(username: string, tradeId: string): Promise<UserActionResult>
- bulkGiftAction · function · L102-L116 — async function bulkGiftAction(usernames: string[], count: number): Promise<UserActionResult>
- bulkTagAction · function · L119-L132 — async function bulkTagAction(usernames: string[], tag: string, mode: 'add' | 'remove'): Promise<UserActionResult>
- setPullLimitAction · function · L137-L143 — async function setPullLimitAction(username: string, value: string): Promise<UserActionResult>
- addPullBuffAction · function · L146-L153 — async function addPullBuffAction(username: string, amount: string, hours: string, note: string): Promise<UserActionResult>
- removePullBuffAction · function · L155-L161 — async function removePullBuffAction(username: string, id: string): Promise<UserActionResult>
