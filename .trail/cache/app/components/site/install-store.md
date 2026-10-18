# app/components/site/install-store.ts

- InstallPromptEvent · interface · L7-L7 — interface InstallPromptEvent extends Event
- notify · function · L12-L12 — notify = ()
- getInstallPrompt · function · L19-L19 — getInstallPrompt = ()
- wasInstalled · function · L20-L20 — wasInstalled = ()
- subscribeInstall · function · L22-L25 — function subscribeInstall(fn: () => void): () => void
- askToInstall · function · L28-L35 — async function askToInstall(): Promise<boolean>
- isStandalone · function · L38-L41 — function isStandalone(): boolean
