# app/admin/assets/useOptimise.ts

- OptNote · type · L11-L11 — type OptNote = { ok: boolean; message: string };
- Progress · interface · L12-L12 — interface Progress
- absolute · function · L14-L14 — absolute = (url: string)
- mp3Name · function · L15-L15 — mp3Name = (url: string)
- compressSound · function · L18-L24 — async function compressSound(url: string, opts: Mp3Options)
- useOptimise · function · L30-L87 — function useOptimise()
- optimiseCovers · function · L36-L54 — async function optimiseCovers(list: LibraryAsset[])
- optimiseSounds · function · L57-L84 — async function optimiseSounds(list: LibraryAsset[], opts: Mp3Options = DEFAULT_MP3)
