# app/admin/mixitup/CommandsPanel.tsx

- Stats · type · L17-L17 — type Stats = Record<string, { count: number; last: number }>;
- CommandsPanel · function · L20-L178 — function CommandsPanel({ initial, stats, webhookUrl, secret }: { initial: ChatCommand[]; stats: Stats; webhookUrl: string; secret: string })
- patch · function · L29-L29 — patch = (p: Partial<ChatCommand>)
- add · function · L31-L37 — add = ()
- remove · function · L38-L42 — remove = ()
- save · function · L43-L47 — save = ()
- insertVar · function · L48-L55 — insertVar = (name: string)
- changeAction · function · L56-L60 — changeAction = (action: CommandActionId)
- TryIt · function · L180-L206 — function TryIt({ cmd }: { cmd: ChatCommand })
- run · function · L185-L185 — run = ()
- SetupPanel · function · L208-L234 — function SetupPanel({ cmd, webhookUrl, secret }: { cmd: ChatCommand | null; webhookUrl: string; secret: string })
- copy · function · L210-L210 — copy = (t: string)
