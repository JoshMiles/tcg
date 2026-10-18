# app/admin/packs/[packId]/workspace/fields.tsx

- Section · function · L10-L21 — function Section({ title, children, dot, defaultOpen = true, id }: { title: string; children: ReactNode; dot?: 'changed' | 'problem' | null; defaultOpen?: boolean; id?: string })
- Field · function · L23-L31 — function Field({ label, children, help, htmlFor }: { label: string; children: ReactNode; help?: ReactNode; htmlFor?: string })
- NumberInput · function · L34-L44 — function NumberInput({ value, onChange, min, max, step = 'any', id, disabled, ariaLabel, dataCol, dataRow }: { dataCol?: string; dataRow?: number; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number | 'any'; id?: string; disabled?: boolean; ariaLabel?: string })
- Stars · function · L46-L55 — function Stars({ value, onChange, label = 'Stars' }: { value: number; onChange: (n: number) => void; label?: string })
- ArtDrop · function · L58-L96 — function ArtDrop({ label, value, onChange, hint }: { label: string; value: string; onChange: (url: string) => void; hint?: string })
- take · function · L64-L71 — async function take(file: File | undefined | null)
- SoundField · function · L99-L122 — function SoundField({ value, onChange, defaultUrl }: { value: string; onChange: (url: string) => void; defaultUrl?: string })
- take · function · L104-L108 — async function take(file?: File)
