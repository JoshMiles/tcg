# app/u/[username]/ProfileHeader.tsx

- ProfileHeader · function · L14-L88 — function ProfileHeader({ b, isOwner, signedIn, shareSpec, pronouns, staffBadge, canReport = false }: { /** Signed in, not their own profile, not staff: show Report in the menu. */ canReport?: boolean; /** Streamer / Admin / Mod, already resolved on the server (null when none or hidden). */ staffBadge?: StaffBadgeKind | null; b: ProfileBase; isOwner: boolean; signedIn: boolean; shareSpec?: ShareSpec; /** What to show after the name (already resolved on the server), or null. */ pronouns?: string | null })
