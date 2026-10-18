# lib/user-settings.ts

- Watch · interface · L18-L18 — interface Watch
- accentHex · function · L27-L27 — accentHex = (v: string)
- MotionPref · type · L29-L29 — type MotionPref = 'system' | 'reduce';
- CollectionView · type · L30-L30 — type CollectionView = 'grid' | 'binder';
- UserSettings · interface · L32-L79 — interface UserSettings
- Experiment · interface · L109-L109 — interface Experiment
- sanitizeUserSettings · function · L121-L149 — function sanitizeUserSettings(input: unknown): UserSettings
- sparse · function · L152-L156 — function sparse(s: UserSettings): Partial<UserSettings>
- hasExperiment · function · L158-L158 — hasExperiment = (s: UserSettings, id: string)
- NoticeGroup · type · L160-L160 — type NoticeGroup = 'offers' | 'results' | 'watch' | 'feedback';
- noticeGroup · function · L162-L168 — function noticeGroup(kind: string): NoticeGroup | null
- wantsNotice · function · L171-L174 — function wantsNotice(s: UserSettings, kind: string): boolean
