# lib/install-detect.ts

- InstallPlatform · type · L3-L3 — type InstallPlatform = 'ios' | 'android' | 'desktop';
- InstallBrowser · type · L4-L4 — type InstallBrowser = 'safari' | 'chrome' | 'firefox' | 'samsung' | 'edge' | 'other';
- InstallEnv · interface · L6-L11 — interface InstallEnv
- detectInstallEnv · function · L16-L27 — function detectInstallEnv(ua: string, touchPoints = 0): InstallEnv
