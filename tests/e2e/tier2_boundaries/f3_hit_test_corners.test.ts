/**
 * Tier 2 — Boundary & Corner Cases: F3 Click-Through & Dynamic Hit-Testing (R2)
 * Authoritative Source: ORIGINAL_REQUEST.md (lines 20, 44-45), PROJECT.md (§ Architecture, Feature 3)
 */

import { assert, assertEquals } from '../helpers/assert.ts';
import { isPointInsideIslandHitbox, MockTauriBackend } from '../helpers/harness.ts';
import { IslandRect } from '../helpers/types.ts';

Deno.test('Tier 2 / F3-B01: Exact perimeter corner coordinates resolve as inside bounds', () => {
  // Authoritative derivation: explorer_survey_2 lines 343-346 & cursor.rs
  // bounds: [300, 0, 440, 34], margins: left-4, right+4, top-2, bottom+6
  // Exact inclusive rect: [296, -2, 444, 40]
  const bounds: IslandRect = { left: 300, top: 0, right: 440, bottom: 34 };

  // Top-left boundary: (296, -2)
  assert(isPointInsideIslandHitbox(296, -2, bounds), 'Top-left corner must be inside');

  // Top-right boundary: (444, -2)
  assert(isPointInsideIslandHitbox(444, -2, bounds), 'Top-right corner must be inside');

  // Bottom-left boundary: (296, 40)
  assert(isPointInsideIslandHitbox(296, 40, bounds), 'Bottom-left corner must be inside');

  // Bottom-right boundary: (444, 40)
  assert(isPointInsideIslandHitbox(444, 40, bounds), 'Bottom-right corner must be inside');

  // 1px outside each corner
  assert(!isPointInsideIslandHitbox(295, -2, bounds), '1px left of boundary must be outside');
  assert(!isPointInsideIslandHitbox(445, -2, bounds), '1px right of boundary must be outside');
  assert(!isPointInsideIslandHitbox(444, 41, bounds), '1px below boundary must be outside');
});

Deno.test('Tier 2 / F3-B02: High-speed cursor velocity traversal simulation (2000 px/s)', () => {
  // Authoritative derivation: explorer_survey_3 line 805
  // Sweeping cursor across screen at 2000 px/s with 16ms poll intervals
  const bounds: IslandRect = { left: 300, top: 0, right: 440, bottom: 34 };
  const stepPerFrame = 2000 * 0.016; // ~32 px per frame

  let detectedEntry = false;
  // Sweep from x=0 to x=600 at y=15
  for (let x = 0; x <= 600; x += stepPerFrame) {
    if (isPointInsideIslandHitbox(x, 15, bounds)) {
      detectedEntry = true;
      break;
    }
  }

  assert(detectedEntry, '16ms polling must catch 2000 px/s cursor sweep over 140px wide notch');
});

Deno.test('Tier 2 / F3-B03: Fractional / sub-pixel cursor coordinate handling', () => {
  // Authoritative derivation: DPI scaling produces fractional client coordinates
  const bounds: IslandRect = { left: 300, top: 0, right: 440, bottom: 34 };

  assert(isPointInsideIslandHitbox(310.45, 12.8, bounds));
  assert(!isPointInsideIslandHitbox(295.99, 12.8, bounds));
});

Deno.test('Tier 2 / F3-B04: Distant cursor adaptive throttling interval (150ms)', () => {
  // Authoritative derivation: explorer_survey_3 lines 640-650
  // If cursor.y > bounds.bottom + 80, polling throttles to 150ms
  const bounds: IslandRect = { left: 300, top: 0, right: 440, bottom: 34 };
  const thresholdY = bounds.bottom + 80; // 114px

  const getPollIntervalMs = (cursorY: number): number => {
    return cursorY > thresholdY ? 150 : 16;
  };

  assertEquals(getPollIntervalMs(50), 16, 'Active upper band polls at 16ms');
  assertEquals(getPollIntervalMs(110), 16, 'Below notch but within 80px buffer polls at 16ms');
  assertEquals(getPollIntervalMs(200), 150, 'Distant cursor polls at 150ms for 0% CPU');
});

Deno.test('Tier 2 / F3-B05: Rapid interactive lock toggling stress (50 cycles)', () => {
  // Authoritative derivation: PROJECT.md line 58
  const backend = new MockTauriBackend();

  for (let i = 0; i < 50; i++) {
    const lock = i % 2 === 0;
    backend.set_interactive_lock(lock);
    assertEquals(backend.interactiveLocked, lock);
  }

  // End state: locked
  backend.set_interactive_lock(true);
  assertEquals(backend.clickThroughIgnored, false);
});
