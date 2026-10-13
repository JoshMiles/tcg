// Works out how the visitor is browsing, so the install guide can open on the right instructions (pure, client-safe).

export type InstallPlatform = 'ios' | 'android' | 'desktop';
export type InstallBrowser = 'safari' | 'chrome' | 'firefox' | 'samsung' | 'edge' | 'other';

export interface InstallEnv {
  platform: InstallPlatform;
  browser: InstallBrowser;
  /** Opened inside another app's built-in browser (Instagram, Facebook, Twitch...), which can't add to the home screen. */
  inApp: boolean;
}

const IN_APP = /FBAN|FBAV|Instagram|Line\/|Twitch|TikTok|musical_ly|Snapchat|Twitter|Discord|Pinterest|LinkedInApp|; wv\)/i;

/** `touchPoints` is `navigator.maxTouchPoints`: iPadOS reports itself as a Mac, so touch is how it is told apart. */
export function detectInstallEnv(ua: string, touchPoints = 0): InstallEnv {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  const android = /Android/i.test(ua);
  const platform: InstallPlatform = ios ? 'ios' : android ? 'android' : 'desktop';
  let browser: InstallBrowser = 'other';
  if (/SamsungBrowser/i.test(ua)) browser = 'samsung';
  else if (/EdgA|EdgiOS|Edg\//.test(ua)) browser = 'edge';
  else if (/FxiOS|Firefox/i.test(ua)) browser = 'firefox';
  else if (/CriOS|Chrome\//.test(ua)) browser = 'chrome';
  else if (/Safari\//.test(ua)) browser = 'safari';
  return { platform, browser, inApp: IN_APP.test(ua) };
}
