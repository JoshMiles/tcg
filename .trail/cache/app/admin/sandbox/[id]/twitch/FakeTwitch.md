# app/admin/sandbox/[id]/twitch/FakeTwitch.tsx

- ViewKind · type · L5-L5 — type ViewKind = 'panel' | 'mobile' | 'video';
- Who · type · L6-L6 — type Who = { kind: 'anon' } | { kind: 'viewer'; login: string } | { kind: 'broadcaster'; login: string };
- FakeTwitch · function · L16-L146 — function FakeTwitch({ sandboxId, users, channel }: { sandboxId: string; users: string[]; channel: string })
- load · function · L31-L37 — function load(next: { who?: Who; view?: ViewKind; shared?: boolean } = {})
- onMsg · function · L43-L45 — onMsg = (e: MessageEvent)
- choose · function · L50-L50 — choose = (w: Who)
- pickView · function · L51-L51 — pickView = (v: ViewKind)
- is · function · L57-L57 — is = (w: Who)
- chip · function · L59-L59 — chip = (active: boolean)
