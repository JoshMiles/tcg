// The main window's remembered place (ROADMAP 59.2): is the saved spot still on a screen, and what to do if not. Run with the rest: npm run check.
import assert from 'node:assert/strict';
import { cleanWinState, placeWindow, type WinState } from '../src/winstate';

export function winStateChecks(): void {
  const one = { x: 0, y: 0, width: 1920, height: 1040 };
  const two = { x: 1920, y: 0, width: 1280, height: 1000 };
  const saved = (o: Partial<WinState> = {}): WinState => ({ x: 100, y: 100, width: 1100, height: 700, maximized: false, ...o });

  assert.deepEqual(placeWindow(null, [one], one), { x: 320, y: 120, width: 1280, height: 800, maximized: false }, 'nothing saved: the default size, centred');
  assert.deepEqual(placeWindow(saved(), [one], one), saved(), 'a saved spot on a screen is kept');
  assert.equal(placeWindow(saved({ maximized: true }), [one], one).maximized, true, 'maximised is kept');
  assert.deepEqual(placeWindow(saved({ x: 2000, y: 50 }), [one, two], one), saved({ x: 2000, y: 50 }), 'a spot on the second screen is kept while it is there');
  assert.deepEqual(placeWindow(saved({ x: 2000, y: 50 }), [one], one), { x: 320, y: 120, width: 1280, height: 800, maximized: false }, 'the second screen is unplugged: back to the centred default');
  assert.equal(placeWindow(saved({ x: 5000, y: 5000 }), [one], one).x, 320, 'far off every screen: the default');
  assert.equal(placeWindow(saved({ x: 1850, y: 100 }), [one], one).x, 320, 'only a sliver of the title bar on a screen: the default');
  assert.equal(placeWindow(saved({ x: 100, y: -300 }), [one], one).x, 320, 'title bar above the screen: the default');
  assert.deepEqual(placeWindow(saved({ x: 1500, y: 500, width: 1100, height: 900 }), [one], one), saved({ x: 820, y: 140, width: 1100, height: 900 }), 'a window that hangs off the screen is pulled back in');
  assert.deepEqual(placeWindow(saved({ width: 2500, height: 1500 }), [one], one), { x: 0, y: 0, width: 1920, height: 1040, maximized: false }, 'a size bigger than the screen is clamped to its work area');
  const small = { x: 0, y: 0, width: 1024, height: 700 };
  assert.deepEqual(placeWindow(null, [small], small), { x: 0, y: 0, width: 1024, height: 700, maximized: false }, 'a small screen: the default is clamped too');

  assert.equal(cleanWinState({ x: 1, y: 2, width: 800, height: 600 }), null, 'smaller than the minimum is not trusted');
  assert.equal(cleanWinState('junk'), null);
  assert.equal(cleanWinState({ x: NaN, y: 0, width: 1000, height: 700 }), null);
  assert.deepEqual(cleanWinState({ x: 1.4, y: -20, width: 1000, height: 700, maximized: 'yes' }), { x: 1, y: -20, width: 1000, height: 700, maximized: false });
}
