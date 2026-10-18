# app/admin/components/CardsEditor.tsx

- CardRow · interface · L15-L19 — interface CardRow extends CardInput
- newRow · function · L24-L34 — function newRow(over: Partial<CardRow> = {}): CardRow
- cardsSignature · function · L37-L39 — function cardsSignature(rows: CardRow[]): string
- nameFromFile · function · L41-L42 — nameFromFile = (file: File)
- CardsEditor · function · L46-L297 — function CardsEditor({ cards, setCards, upgradesEnabled, packDisabled = [], confirmDelete = false, }: { cards: CardRow[]; setCards: Dispatch<SetStateAction<CardRow[]>>; upgradesEnabled: boolean; /** Variants already switched off for the whole pack (shown locked on each card). */ packDisabled?: OptionalVariant[]; /** Ask before deleting a card that already has a number (i.e. may be in viewers' collections). */ confirmDelete?: boolean; })
- patch · function · L64-L65 — patch = (id: string, p: Partial<CardRow>)
- uploadInto · function · L68-L80 — async function uploadInto(id: string, file: File, field: 'imageUrl' | 'fullArtImageUrl' | 'soundUrl')
- addFiles · function · L83-L98 — async function addFiles(fileList: FileList | File[])
- worker · function · L91-L96 — worker = async ()
- setStars · function · L100-L104 — function setStars(c: CardRow, stars: number)
- remove · function · L106-L108 — function remove(c: CardRow)
- needsSure · function · L110-L110 — needsSure = (c: CardRow)
- duplicate · function · L112-L117 — duplicate = (c: CardRow)
- ArtSlot · function · L300-L329 — function ArtSlot({ label, url, busy, compact, onFile, onClear, }: { label: string; url: string; busy?: string; compact?: boolean; onFile: (f: File) => void; onClear: () => void; })
- SoundSlot · function · L331-L346 — function SoundSlot({ url, onFile, onClear }: { url?: string; onFile: (f: File) => void; onClear: () => void })
