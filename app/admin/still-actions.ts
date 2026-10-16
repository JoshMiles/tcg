'use server';
import { requireAdmin } from '@/lib/admin-guard';
import { isFrameSourceUrl } from '@/lib/card-art';
import { loadFrameSource } from '@/lib/card-frames';
import { frameInfo, renderFrame } from '@/lib/card-image';
import { storeStill } from '@/lib/card-upload';

/**
 * Renders frame `frame` of a card's art at thumbnail size and stores it as a new still in Blob. Returns its URL; the editor puts it in the
 * card's stillUrl / fullArtStillUrl field and the card's own save (or the wizard's autosave) keeps it.
 */
export async function renderStillAction(artUrl: string, frame: number): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireAdmin();
  if (!isFrameSourceUrl(String(artUrl))) return { ok: false, error: 'That is not card art this tool can use.' };
  const source = await loadFrameSource(artUrl);
  if (!source) return { ok: false, error: 'Could not read the image.' };
  try {
    const k = Math.floor(Number(frame));
    const { frames } = await frameInfo(source);
    if (!Number.isInteger(k) || k < 0 || k >= frames) return { ok: false, error: 'No such frame.' };
    return { ok: true, url: await storeStill(await renderFrame(source, k), k) };
  } catch (e) {
    return { ok: false, error: e instanceof Error && /BLOB|token/i.test(e.message) ? 'Could not store the still (is Blob connected here?).' : 'Could not make a still from that image.' };
  }
}
