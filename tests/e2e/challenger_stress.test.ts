/**
 * Adversarial Challenger Stress Harness for Milestone 1:
 * Dynamic Click-Through, Velocity Sweeps, Interactive Lock, and Boundary Coordinates.
 *
 * Requirements verified:
 * - R2: Transparent Overlay Window Presentation & Click-Through
 * - Interface Contracts: set_interactive_lock, update_island_bounds, set_ignore_cursor_events
 */

import { assert, assertEquals } from './helpers/assert.ts';
import { isPointInsideIslandHitbox, MockTauriBackend } from './helpers/harness.ts';
import { IslandRect } from './helpers/types.ts';

Deno.test('Challenger-01: Rapid cursor velocity sweep (2000 px/s) horizontal transition accuracy', () => {
  const backend = new MockTauriBackend();
  const notchBounds: IslandRect = { left: 300, top: 0, right: 440, bottom: 34 };
  backend.update_island_bounds(notchBounds);

  // Velocity: 2000 px/s at 60 FPS (16ms polling interval)
  const dt = 0.016;
  const stepPx = 2000 * dt; // 32 px per frame

  let enterCount = 0;
  let exitCount = 0;
  let framesInside = 0;
  let previousState = backend.clickThroughIgnored; // starts true

  // Sweep from x = 0 to x = 740 across y = 15 (center of island)
  for (let x = 0; x <= 740; x += stepPx) {
    const ignored = backend.onCursorMove(x, 15);
    if (previousState && !ignored) {
      enterCount++;
    } else if (!previousState && ignored) {
      exitCount++;
    }
    if (!ignored) {
      framesInside++;
    }
    previousState = ignored;
  }

  // Final check after sweep finishes past island
  backend.onCursorMove(740, 15);
  assertEquals(backend.clickThroughIgnored, true, 'Cursor at end of window must ignore events');
  assertEquals(enterCount, 1, 'Cursor must cleanly enter island exactly once');
  assertEquals(exitCount, 1, 'Cursor must cleanly exit island exactly once');
  assert(
    framesInside >= 4,
    `Cursor moving at 2000 px/s must spend at least 4 frames inside 148px hitbox (observed: ${framesInside})`
  );
});

Deno.test('Challenger-02: Velocity sweeps across spectrum (500, 1000, 2000 px/s) & diagonal sweep', () => {
  const backend = new MockTauriBackend();
  const notchBounds: IslandRect = { left: 300, top: 0, right: 440, bottom: 34 };
  backend.update_island_bounds(notchBounds);

  const velocities = [500, 1000, 1500, 2000];

  for (const v of velocities) {
    const step = v * 0.016;
    let detected = false;
    for (let x = 0; x <= 740; x += step) {
      const ignored = backend.onCursorMove(x, 15);
      if (!ignored) {
        detected = true;
        break;
      }
    }
    assert(detected, `Velocity ${v} px/s must be detected by 16ms cursor monitor`);
  }

  // Diagonal sweep passing through island center (370, 15) at 2000 px/s
  // Start at (330, -25) aimed at (420, 65)
  const diagStepX = 2000 * 0.016 * 0.7071; // ~22.6 px
  const diagStepY = 2000 * 0.016 * 0.7071;
  let diagonalHitCount = 0;
  let currX = 330;
  let currY = -25;
  while (currX <= 420 && currY <= 65) {
    const ignored = backend.onCursorMove(currX, currY);
    if (!ignored) {
      diagonalHitCount++;
    }
    currX += diagStepX;
    currY += diagStepY;
  }

  assert(diagonalHitCount >= 1, `Diagonal sweep at 2000 px/s must register inside island (observed ${diagonalHitCount})`);
});

Deno.test('Challenger-03: Rapid oscillation stress (100 back-and-forth traversals)', () => {
  const backend = new MockTauriBackend();
  const notchBounds: IslandRect = { left: 300, top: 0, right: 440, bottom: 34 };
  backend.update_island_bounds(notchBounds);

  // Rapidly move between inside (370, 15) and outside (100, 15) 100 times
  for (let cycle = 0; cycle < 100; cycle++) {
    const ignoredInside = backend.onCursorMove(370, 15);
    assertEquals(ignoredInside, false, `Cycle ${cycle}: inside notch must not ignore events`);

    const ignoredOutside = backend.onCursorMove(100, 15);
    assertEquals(ignoredOutside, true, `Cycle ${cycle}: outside notch must ignore events`);
  }
});

Deno.test('Challenger-04: set_interactive_lock(true) completely locks overlay interactive across all coordinates', () => {
  const backend = new MockTauriBackend();
  const notchBounds: IslandRect = { left: 300, top: 0, right: 440, bottom: 34 };
  backend.update_island_bounds(notchBounds);

  // Activate interactive lock (simulating Isle Assistant open)
  backend.set_interactive_lock(true);
  assertEquals(backend.clickThroughIgnored, false, 'Lock activation must immediately disable ignore events');

  // Exhaustive grid of coordinates covering window boundaries and beyond
  const testCoords = [
    [0, 0],
    [10, 10],
    [50, 200],
    [100, 300],
    [739, 339],
    [740, 340],
    [295, 15],     // 1px left of island margin
    [445, 15],     // 1px right of island margin
    [370, -3],     // 1px above island margin
    [370, 41],     // 1px below island margin
    [-50, -50],    // negative screen coordinates
    [-1920, 100],  // second monitor
    [370, 15],     // inside island
    [500, 250],    // conversation message area
  ];

  for (const [x, y] of testCoords) {
    const ignored = backend.onCursorMove(x, y);
    assertEquals(
      ignored,
      false,
      `When locked interactive, coordinate (${x}, ${y}) must NEVER ignore cursor events (click-through forbidden)`
    );
    assertEquals(backend.clickThroughIgnored, false);
  }
});

Deno.test('Challenger-05: set_interactive_lock toggle lifecycle and instantaneous restoration', () => {
  const backend = new MockTauriBackend();
  const notchBounds: IslandRect = { left: 300, top: 0, right: 440, bottom: 34 };
  backend.update_island_bounds(notchBounds);

  // Position cursor outside island
  backend.onCursorMove(50, 200);
  assertEquals(backend.clickThroughIgnored, true);

  // Turn lock ON
  backend.set_interactive_lock(true);
  assertEquals(backend.clickThroughIgnored, false);

  // Move while locked outside
  backend.onCursorMove(60, 210);
  assertEquals(backend.clickThroughIgnored, false);

  // Turn lock OFF
  backend.set_interactive_lock(false);

  // Next cursor move outside must immediately restore click-through
  backend.onCursorMove(60, 210);
  assertEquals(backend.clickThroughIgnored, true, 'After unlocking, cursor outside must immediately ignore events');
});

Deno.test('Challenger-06: Perimeter corner coordinates, margins, and 1px outside boundaries', () => {
  const bounds: IslandRect = { left: 300, top: 0, right: 440, bottom: 34 };
  // Margins: left-4, right+4, top-2, bottom+6
  // Inclusive active rectangle: [296, -2, 444, 40]

  // 4 corners strictly INSIDE
  assert(isPointInsideIslandHitbox(296, -2, bounds), 'Top-left corner must be inside');
  assert(isPointInsideIslandHitbox(444, -2, bounds), 'Top-right corner must be inside');
  assert(isPointInsideIslandHitbox(296, 40, bounds), 'Bottom-left corner must be inside');
  assert(isPointInsideIslandHitbox(444, 40, bounds), 'Bottom-right corner must be inside');

  // 1px outside strictly OUTSIDE
  assert(!isPointInsideIslandHitbox(295, -2, bounds), '1px left of top-left must be outside');
  assert(!isPointInsideIslandHitbox(296, -3, bounds), '1px above top-left must be outside');
  assert(!isPointInsideIslandHitbox(445, -2, bounds), '1px right of top-right must be outside');
  assert(!isPointInsideIslandHitbox(444, -3, bounds), '1px above top-right must be outside');
  assert(!isPointInsideIslandHitbox(295, 40, bounds), '1px left of bottom-left must be outside');
  assert(!isPointInsideIslandHitbox(296, 41, bounds), '1px below bottom-left must be outside');
  assert(!isPointInsideIslandHitbox(445, 40, bounds), '1px right of bottom-right must be outside');
  assert(!isPointInsideIslandHitbox(444, 41, bounds), '1px below bottom-right must be outside');

  // Sub-pixel floating point accuracy
  assert(isPointInsideIslandHitbox(296.0, 0.0, bounds), '296.0 must be inside');
  assert(!isPointInsideIslandHitbox(295.999, 0.0, bounds), '295.999 must be outside');
  assert(isPointInsideIslandHitbox(444.0, 0.0, bounds), '444.0 must be inside');
  assert(!isPointInsideIslandHitbox(444.001, 0.0, bounds), '444.001 must be outside');
});

Deno.test('Challenger-07: Negative coordinates and multi-monitor cursor handling', () => {
  const backend = new MockTauriBackend();
  const bounds: IslandRect = { left: 300, top: 0, right: 440, bottom: 34 };
  backend.update_island_bounds(bounds);

  const negativeCoords = [
    [-1, -1],
    [-10, 15],
    [-100, -100],
    [-1920, 500],
    [-3840, -100],
  ];

  for (const [x, y] of negativeCoords) {
    const inside = isPointInsideIslandHitbox(x, y, bounds);
    assert(!inside, `Negative coordinate (${x}, ${y}) must not be inside island`);

    const ignored = backend.onCursorMove(x, y);
    assertEquals(ignored, true, `Negative coordinate (${x}, ${y}) must ignore events (pass through)`);
  }
});

Deno.test('Challenger-08: Window boundary coordinates (0 to 740, 0 to 340)', () => {
  const backend = new MockTauriBackend();
  const bounds: IslandRect = { left: 300, top: 0, right: 440, bottom: 34 };
  backend.update_island_bounds(bounds);

  // Four window boundaries outside island
  assertEquals(backend.onCursorMove(0, 0), true, 'Window top-left outside island');
  assertEquals(backend.onCursorMove(740, 0), true, 'Window top-right outside island');
  assertEquals(backend.onCursorMove(0, 340), true, 'Window bottom-left outside island');
  assertEquals(backend.onCursorMove(740, 340), true, 'Window bottom-right outside island');
});
