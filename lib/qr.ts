import qrcode from 'qrcode-generator';

/** A QR code as a grid of dark modules (client-safe; used by the flip card's back and the share image). Null if the text cannot be encoded. */
export function qrModules(text: string, origin?: string): { size: number; dark: (r: number, c: number) => boolean } | null {
  try {
    const q = qrcode(0, 'M');
    // `origin` (the address the page is served from) replaces the link's own, so a local or preview build never points at production.
    q.addData(origin ? origin + text.slice(new URL(text).origin.length) : text);
    q.make();
    return { size: q.getModuleCount(), dark: (r, c) => q.isDark(r, c) };
  } catch { return null; }
}

/** The same as one SVG path (dark modules only), so it can be styled like the rest of an engraving. */
export function qrPath(text: string, origin?: string): { d: string; size: number } | null {
  const m = qrModules(text, origin);
  if (!m) return null;
  let d = '';
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return { d, size: m.size };
}
