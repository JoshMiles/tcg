# app/admin/components/image-upload.tsx

- Status · type · L5-L5 — type Status = 'idle' | 'uploading' | 'optimizing';
- ImageUploadField · function · L7-L70 — function ImageUploadField({ name = 'imageUrl', defaultValue, label: fieldLabel = 'Image URL', onUrlChange, }: { name?: string; defaultValue?: string; label?: string; /** Called whenever the URL changes (typed or uploaded), for forms that keep their own state. */ onUrlChange?: (url: string) => void; })
- setUrl · function · L24-L27 — function setUrl(next: string)
- handleFile · function · L29-L42 — async function handleFile(e: React.ChangeEvent<HTMLInputElement>)
