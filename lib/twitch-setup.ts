// The values to enter in the Twitch developer console for the extension and website login, in one place (pure).

export interface SetupItem { id: string; label: string; value: string; hint: string; group: 'Extension views' | 'Policies' | 'Allowlists' | 'Website login' }

/** `base` is the public site URL with no trailing slash. */
export function extensionChecklist(base: string): SetupItem[] {
  return [
    { id: 'panel', group: 'Extension views', label: 'Panel viewer path', value: `${base}/twitch-panel/panel.html`, hint: 'Extension → Files / Asset hosting: Panel HTML file URL.' },
    { id: 'mobile', group: 'Extension views', label: 'Mobile viewer path', value: `${base}/twitch-panel/mobile.html`, hint: 'Enable the Mobile view on the extension\'s Capabilities page first.' },
    { id: 'video', group: 'Extension views', label: 'Video - Component viewer path', value: `${base}/twitch-panel/video_component.html`, hint: 'Enable the Video - Component view on the Capabilities page first.' },
    { id: 'privacy', group: 'Policies', label: 'Privacy Policy URL', value: `${base}/privacy`, hint: 'Extension → Settings: Privacy Policy URL.' },
    { id: 'terms', group: 'Policies', label: 'EULA (Terms) URL', value: `${base}/terms`, hint: 'Extension → Settings: EULA Terms of Service URL.' },
    { id: 'fetch', group: 'Allowlists', label: 'Allowlisted URL for Fetching Data', value: base, hint: 'Extension → Capabilities: the panel calls the API on this origin.' },
    { id: 'redirect', group: 'Website login', label: 'OAuth Redirect URL', value: `${base}/auth/twitch/callback`, hint: 'dev.twitch.tv → Applications → your app (the one whose Client ID and Secret are in the environment variables).' },
  ];
}
