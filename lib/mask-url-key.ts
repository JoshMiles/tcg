/** Client-safe: hides the `key=` value of an overlay URL so it can sit on screen during a stream. The URL itself is never changed. */
export function maskUrlKey(url: string): string {
  return url.replace(/([?&]key=)[^&#]+/, '$1••••••••');
}
