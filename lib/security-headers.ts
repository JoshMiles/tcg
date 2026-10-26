// Security headers for the whole site, used by next.config.ts and asserted by scripts/check-security-headers.mts.
// Plain data, no imports, so the config file (which Next loads before the app) can use it.
//
// Two paths families must stay embeddable or loadable by things we do not control, so they are left out of the frame rule and the CSP:
//   /overlay*, /widget*   the OBS browser source (and the admin previews, which frame it from our own origin)
//   /twitch-panel/*       the Twitch Extension panel (Twitch's iframe; its CORS rules live in middleware.ts and are frozen)
// Both still get the site-wide headers (nosniff, referrer, permissions, HSTS), none of which stops framing.

export type Header = { key: string; value: string };
export type HeaderRule = { source: string; headers: Header[] };

/** Path prefixes (no leading slash) that must stay frameable and outside the CSP. Used inside a negative lookahead. */
export const EMBEDDED_PATHS = ['overlay', 'widget', 'twitch-panel'];

/** Pages and API that carry the frame rule: everything except the embedded paths. */
export const FRAMED_SOURCE = `/((?!${EMBEDDED_PATHS.join('|')}).*)`;
/** The CSP trial covers the website's pages only: not the embedded paths, not JSON from /api. */
export const CSP_SOURCE = `/((?!${[...EMBEDDED_PATHS, 'api/'].join('|')}).*)`;

export const CSP_REPORT_PATH = '/api/csp-report';

/**
 * The Content-Security-Policy trial (ROADMAP 47.5, security audit X-1). Built from what the site loads:
 * Vercel Blob (card art, uploads), Twitch avatars (static-cdn.jtvnw.net), Cloudflare Turnstile (script and iframe), Vercel
 * Analytics (served from our own /_vercel path in production; va.vercel-scripts.com in development). Next.js hydrates with inline
 * scripts, so script-src needs 'unsafe-inline' until nonces are added; development also needs 'unsafe-eval'.
 */
export function cspPolicy(dev = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''} https://challenges.cloudflare.com https://va.vercel-scripts.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://static-cdn.jtvnw.net",
    "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.public.blob.vercel-storage.com",
    "frame-src 'self' https://challenges.cloudflare.com",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://id.twitch.tv",
    "frame-ancestors 'self'",
    `report-uri ${CSP_REPORT_PATH}`,
  ].join('; ');
}

export function securityHeaderRules(dev = false): HeaderRule[] {
  return [
    {
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
        // No includeSubDomains or preload: those would commit other subdomains of the domain too.
        { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
      ],
    },
    // SAMEORIGIN, not DENY: the admin overlay previews frame our own pages.
    { source: FRAMED_SOURCE, headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
    { source: CSP_SOURCE, headers: [{ key: 'Content-Security-Policy-Report-Only', value: cspPolicy(dev) }] },
  ];
}
