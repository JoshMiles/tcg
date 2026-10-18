# lib/push-prompt-core.ts

- PromptState · interface · L10-L10 — interface PromptState
- PromptMode · type · L11-L11 — type PromptMode = 'turn-on' | 'install' | null;
- parsePromptState · function · L14-L20 — function parsePromptState(raw: string | null): PromptState
- dismissed · function · L23-L25 — function dismissed(s: PromptState, now: number): PromptState
- isPhoneLike · function · L28-L30 — function isPhoneLike(ua: string, touchPoints: number, standalone: boolean): boolean
- PromptInput · interface · L32-L43 — interface PromptInput
- promptMode · function · L46-L52 — function promptMode(i: PromptInput): PromptMode
