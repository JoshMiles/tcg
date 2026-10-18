# app/admin/components/use-autosave.ts

- SaveState · type · L4-L4 — type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
- useAutosave · function · L13-L82 — function useAutosave<T>( value: T, save: (value: T) => Promise<void>, { enabled, delay = 900, signature = (v: T) => JSON.stringify(v) }: { enabled: boolean; delay?: number; signature?: (v: T) => string }, )
- warn · function · L76-L76 — warn = (e: BeforeUnloadEvent)
