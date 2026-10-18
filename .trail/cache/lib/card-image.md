# lib/card-image.ts

- Input · type · L10-L10 — type Input = Buffer | string;
- toAnimatedCard · function · L13-L18 — function toAnimatedCard(input: Input): Promise<Buffer>
- toThumb · function · L21-L26 — function toThumb(input: Input): Promise<Buffer>
- toCover · function · L32-L37 — function toCover(input: Input): Promise<Buffer>
- frameInfo · function · L40-L44 — async function frameInfo(input: Input): Promise<{ frames: number; delayMs: number }>
- renderFrame · function · L47-L52 — function renderFrame(input: Input, frame: number, width = THUMB_WIDTH): Promise<Buffer>
