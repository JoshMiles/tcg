# lib/backup.ts

- BackupClient · interface · L14-L21 — interface BackupClient
- RestoreClient · interface · L23-L29 — interface RestoreClient
- collectEntries · function · L35-L64 — async function collectEntries(client: BackupClient, now = Date.now()): Promise<BackupFile>
- restoreEntries · function · L70-L83 — async function restoreEntries(client: RestoreClient, entries: BackupEntry[], mapKey: (key: string) => string = k => k): Promise<number>
- StoredBackup · interface · L87-L87 — interface StoredBackup
- listBackups · function · L90-L99 — async function listBackups(): Promise<StoredBackup[]>
- BackupStatus · interface · L101-L101 — interface BackupStatus
- backupStatus · function · L104-L115 — async function backupStatus(now = Date.now()): Promise<BackupStatus>
- BackupRun · interface · L117-L117 — interface BackupRun
- runBackup · function · L124-L145 — async function runBackup(now = Date.now()): Promise<BackupRun>
