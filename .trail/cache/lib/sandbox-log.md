# lib/sandbox-log.ts

- LogEntry · interface · L15-L15 — interface LogEntry
- UndoPoint · interface · L17-L23 — interface UndoPoint
- tradeStamp · function · L26-L29 — async function tradeStamp(): Promise<string>
- appendLog · function · L31-L33 — function appendLog(list: LogEntry[], entry: LogEntry): LogEntry[]
- getLog · function · L35-L37 — function getLog(sandboxId: string): Promise<LogEntry[]>
- getUndoLabel · function · L39-L44 — function getUndoLabel(sandboxId: string): Promise<{ label: string; at: number } | null>
- logEvent · function · L47-L51 — function logEvent(sandboxId: string, label: string, detail?: string, undoable = false): Promise<void>
- takeSnapshot · function · L53-L60 — async function takeSnapshot(label: string, usernames: string[]): Promise<UndoPoint>
- withUndo · function · L66-L72 — async function withUndo<T>(sandboxId: string, label: string, usernames: string[], fn: () => Promise<T>, describe?: (r: T) => string): Promise<T>
- undoLast · function · L75-L86 — function undoLast(sandboxId: string): Promise<{ ok: true; label: string } | { ok: false; error: string }>
