# app/admin/settings/DiscordConfig.tsx

- DiscordConfig · function · L34-L149 — function DiscordConfig({ settings, logs = {} }: { settings: DiscordSettings; logs?: Record<string, DiscordLogEntry[]> })
- patch · function · L43-L43 — patch = (id: string, p: Partial<DiscordChannel>)
- ChannelSummary · function · L151-L163 — function ChannelSummary({ channel: c, log, onOpen }: { channel: DiscordChannel; log: DiscordLogEntry[]; onOpen: () => void })
- ChannelCard · function · L165-L312 — function ChannelCard({ channel: c, log, pending, onChange, onRemove }: { channel: DiscordChannel; log: DiscordLogEntry[]; pending: boolean; onChange: (p: Partial<DiscordChannel>) => void; onRemove: () => void; })
