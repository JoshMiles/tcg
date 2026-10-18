# lib/staff-badge-core.ts

- StaffBadge · type · L5-L5 — type StaffBadge = 'streamer' | 'admin' | 'mod';
- staffBadgeFor · function · L9-L22 — function staffBadgeFor( login: string, staff: readonly Pick<StaffRecord, 'login' | 'role'>[], settings: { hideStaffBadge?: boolean } | null | undefined, superLogins: readonly string[] = SUPER_ADMINS.map(s => s.login), streamerLogin: string = CHANNEL_LOGIN, ): StaffBadge | null
