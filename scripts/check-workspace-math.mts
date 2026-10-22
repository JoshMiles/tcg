// Workspace shell maths (ROADMAP 38.29 g): the right column's width clamp and the drag-to-scrub value. Pure, no KV.
// Run: npx tsx scripts/check-workspace-math.mts
import { COLUMN_DEFAULT, COLUMN_MAX, COLUMN_MIN, clampColumn, scrubValue } from '../app/admin/components/workspace/workspace-math';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

ok(clampColumn(10) === COLUMN_MIN && clampColumn(99) === COLUMN_MAX && clampColumn(28) === 28, 'width clamps to 20..36 rem');
ok(clampColumn(NaN) === COLUMN_DEFAULT, 'a bad stored width falls back to the default');

ok(scrubValue(10, 40, 1, false) === 20, '4 px per step');
ok(scrubValue(10, 40, 1, true) === 110, 'Shift is x10');
ok(scrubValue(10, -2, 1, false) === 10 || scrubValue(10, -2, 1, false) === 9, 'sub-step moves stay near the start');
ok(scrubValue(5, -400, 1, false, 0, 100) === 0 && scrubValue(5, 4000, 1, false, 0, 100) === 100, 'min / max clamp');
ok(scrubValue(0.1, 12, 0.05, false) === 0.25, 'fractional steps do not drift (0.1 + 3 x 0.05)');
console.log('workspace math ok');
