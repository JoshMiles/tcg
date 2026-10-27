import { timingSafeEqual } from 'node:crypto';
import { noteSecretUsed } from './secret-used';

/** Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`; with CRON_SECRET unset (or short) every caller is refused. */
export function cronAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET ?? '';
  if (secret.length < 16) return false;
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  const ok = given.length === want.length && timingSafeEqual(given, want);
  if (ok) noteSecretUsed('CRON_SECRET', new URL(req.url).pathname);
  return ok;
}
