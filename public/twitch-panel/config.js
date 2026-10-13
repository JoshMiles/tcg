// Where the site's API and card art live. An empty string means "the same origin as this page", which is right whenever the site itself
// serves the panel (local testing, or Twitch's Testing Base URI pointing at the site). The hosted package built by
// scripts/build-twitch-package.mjs replaces this file with the site's address, because Twitch serves hosted files from its own domain.
window.TCG_SITE = '';
