# lib/commands-core.ts

- CommandActionId · type · L8-L8 — type CommandActionId = 'showoff' | 'card-stats' | 'my-stats' | 'collection' | 'leaderboard' | 'pulls-left' | 'text';
- ErrorKind · type · L9-L9 — type ErrorKind = 'notFound' | 'notOwned' | 'cooldown' | 'offline';
- ChatCommand · interface · L11-L26 — interface ChatCommand
- ActionInfo · interface · L28-L35 — interface ActionInfo
- v · function · L37-L37 — v = (name: string, sample: string, help = '')
- interpolate · function · L110-L112 — function interpolate(template: string, vars: Record<string, string>): string
- tidyReply · function · L115-L118 — function tidyReply(text: string): string
- renderReply · function · L120-L120 — renderReply = (template: string, vars: Record<string, string>)
- sampleVars · function · L122-L124 — function sampleVars(action: CommandActionId): Record<string, string>
- commandWord · function · L127-L127 — commandWord = (raw: unknown): string
- matchCommand · function · L130-L134 — function matchCommand(commands: ChatCommand[], raw: unknown): ChatCommand | null
- clampInt · function · L136-L139 — clampInt = (x: unknown, max: number): number
- word · function · L140-L140 — word = (x: unknown): string
- cleanCommands · function · L143-L171 — function cleanCommands(raw: unknown): { ok: true; commands: ChatCommand[] } | { ok: false; message: string }
- flatReply · function · L174-L177 — function flatReply(ok: boolean, message: string, vars: Record<string, string>): Record<string, unknown>
- argsFrom · function · L180-L183 — function argsFrom(body: Record<string, unknown>): string
