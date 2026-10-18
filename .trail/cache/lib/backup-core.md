# lib/backup-core.ts

- BackupType · type · L11-L11 — type BackupType = 'string' | 'hash' | 'list' | 'set';
- BackupEntry · interface · L12-L12 — interface BackupEntry
- BackupFile · interface · L13-L13 — interface BackupFile
- isBackedUp · function · L39-L42 — function isBackedUp(key: string): boolean
- dayStamp · function · L51-L51 — dayStamp = (at: number)
- backupName · function · L52-L52 — backupName = (at: number)
- pickBackupsToDelete · function · L55-L59 — function pickBackupsToDelete(pathnames: string[], keep = BACKUP_KEEP): string[]
- backupIsStale · function · L62-L64 — function backupIsStale(lastAt: number | null, now: number, hours = BACKUP_STALE_HOURS): boolean
- serializeBackup · function · L71-L73 — function serializeBackup(file: BackupFile): Buffer
- parseBackup · function · L75-L79 — function parseBackup(gz: Buffer): BackupFile
- deriveKey · function · L81-L81 — deriveKey = (secret: string, salt: Buffer)
- encryptBackup · function · L84-L90 — function encryptBackup(plain: Buffer, secret: string): Buffer
- decryptBackup · function · L92-L101 — function decryptBackup(blob: Buffer, secret: string): Buffer
- describeBackup · function · L104-L109 — function describeBackup(f: BackupFile): string
