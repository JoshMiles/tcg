# lib/card-back-store.ts

- key · function · L6-L6 — key = (packId: string)
- getCardBack · function · L9-L16 — async function getCardBack(packId: string): Promise<CardBackStyle | null>
- saveCardBack · function · L19-L24 — async function saveCardBack(packId: string, input: unknown): Promise<CardBackStyle>
- deleteCardBack · function · L26-L28 — async function deleteCardBack(packId: string): Promise<void>
- cardBackFor · function · L31-L33 — async function cardBackFor(pack: Pick<Pack, 'id' | 'name' | 'coverImageUrl'>, seasonName?: string): Promise<CardBackStyle | undefined>
