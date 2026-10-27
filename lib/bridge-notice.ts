// What makes a staff notice (ROADMAP 55.13): the deploy and the paid pull refusal; the other kinds call `sendNotice` (lib/bridge.ts) from where they
// happen. Each is best effort and never throws, and none of it reaches a PC unless that PC has staff tools on (sendNotice checks).
import { kv } from './db';
import { sendNotice } from './bridge';
import { REFUSAL_LABELS } from './mixitup-core';
import type { BuildInfo } from './version';

let announced = ''; // this server instance has already looked at this build

/** The changelog lines of the pull request a build came from (its version is "<major>.<PR>"); none when there are none. */
async function changelogLines(pr: number): Promise<string[]> {
  try {
    const { CHANGELOG, ADMIN_CHANGELOG } = await import('./changelog');
    return [...CHANGELOG, ...ADMIN_CHANGELOG].filter(e => e.pr === pr).flatMap(e => e.items);
  } catch {
    return [];
  }
}

/** A build is live: one notice per build, however many servers see it first (the claim is an atomic SET NX). True when it sent one. */
export async function noteDeploy(info: Pick<BuildInfo, 'version' | 'commitFull'>): Promise<boolean> {
  try {
    if (!info.commitFull || announced === info.commitFull) return false;
    announced = info.commitFull;
    if (!(await kv.set(`bridge:deployed:${info.commitFull}`, 1, { nx: true, ex: 14 * 86_400 }))) return false;
    const pr = Number(info.version.split('.')[1]);
    const lines = Number.isInteger(pr) ? await changelogLines(pr) : [];
    return await sendNotice({ kind: 'deploy', title: `New version live: v${info.version}`, ...(lines.length ? { text: lines.join(' ').slice(0, 300) } : {}), href: '/admin' });
  } catch {
    return false;
  }
}

/** A paid pull was refused. "Not enough Brie Bucks" is routine and skipped; each other reason notifies at most once a minute (an atomic key with expiry). */
export async function noteRefusal(reason: string, username: string): Promise<boolean> {
  try {
    if (reason === 'insufficient_balance') return false;
    if (!(await kv.set(`bridge:refusal:${reason}`, 1, { nx: true, ex: 60 }))) return false;
    return await sendNotice({ kind: 'refusal', title: `Pull refused: ${REFUSAL_LABELS[reason] ?? reason}`, text: username, href: '/admin/mixitup' });
  } catch {
    return false;
  }
}
