// What's new (ROADMAP 57.11): picking the releases between two versions, the tiny markdown parser and the 6 hour cache. Run with the rest: npm run check.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bridgeReleases, compareVersions, loadReleases, MAX_NOTES, parseNotes, releasesBetween, CACHE_MS } from '../src/releases';

export async function releasesChecks(): Promise<void> {
  // Semver, not text order: 0.10.0 is newer than 0.9.0.
  assert.ok(compareVersions('0.10.0', '0.9.0') > 0 && compareVersions('1.0.0', '0.99.9') > 0 && compareVersions('0.2.1', '0.2.1') === 0);

  // Only non-draft bridge-v<x.y.z> releases count; junk is dropped.
  const raw = [
    { tag_name: 'bridge-v0.20.0', body: 'twenty' }, { tag_name: 'bridge-v0.22.0', body: 'draft', draft: true }, { tag_name: 'v5.1', body: 'site' },
    { tag_name: 'bridge-v0.19.0', body: 'nineteen' }, { tag_name: 'bridge-v0.21.0-beta', body: 'x' }, { tag_name: 'bridge-v0.21.0' }, null, 'x', { tag_name: 5 },
  ];
  const all = bridgeReleases(raw);
  assert.deepEqual(all.map(r => r.version), ['0.20.0', '0.19.0', '0.21.0']);
  assert.equal(all[2].body, '', 'a missing body is empty');
  assert.deepEqual(bridgeReleases('nope'), []);

  // Between lastSeen (exclusive) and current (inclusive), newest first.
  assert.deepEqual(releasesBetween(all, '0.19.0', '0.21.0').map(r => r.version), ['0.21.0', '0.20.0']);
  assert.deepEqual(releasesBetween(all, '0.21.0', '0.21.0'), []);
  assert.deepEqual(releasesBetween(all, '0.19.0', '0.20.0').map(r => r.version), ['0.20.0'], 'a release newer than the running version is left out');
  const many = Array.from({ length: 30 }, (_, i) => ({ version: `0.${i + 1}.0`, body: '' }));
  const capped = releasesBetween(many, '0.0.1', '0.30.0');
  assert.equal(capped.length, MAX_NOTES);
  assert.equal(capped[0].version, '0.30.0');

  // The markdown subset: headings, bullets, paragraphs; marks and links reduced to text; HTML never interpreted.
  assert.deepEqual(parseNotes('## Changelog\r\n\r\n- **New** thing, see [the docs](https://evil.test/x)\n* `code` item\nplain <img src=x onerror=alert(1)> line\n'), [
    { kind: 'heading', text: 'Changelog' },
    { kind: 'bullet', text: 'New thing, see the docs' },
    { kind: 'bullet', text: 'code item' },
    { kind: 'text', text: 'plain <img src=x onerror=alert(1)> line' },
  ]);
  assert.deepEqual(parseNotes(''), []);

  // The cache: fresh for 6 hours, refetched after, kept when the refetch fails, and a failure with no cache throws.
  const dir = mkdtempSync(join(tmpdir(), 'bridge-releases-'));
  try {
    let calls = 0;
    let fail = false;
    const fetchList = async (): Promise<unknown> => { calls++; if (fail) throw new Error('offline'); return raw; };
    assert.equal((await loadReleases(dir, 1_000, fetchList)).length, 3);
    assert.equal((await loadReleases(dir, 1_000 + CACHE_MS - 1, fetchList)).length, 3);
    assert.equal(calls, 1, 'the second load came from the cache');
    fail = true;
    assert.equal((await loadReleases(dir, 1_000 + CACHE_MS, fetchList)).length, 3, 'a stale cache is better than nothing');
    assert.equal(calls, 2);
    await assert.rejects(loadReleases(join(dir, 'empty'), 1_000, fetchList), /offline/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
