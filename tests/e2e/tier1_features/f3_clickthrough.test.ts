/**
 * Tier 1 — Feature 3: Dynamic Click-Through Hit-Testing (R2)
 * Authoritative Source: ORIGINAL_REQUEST.md (lines 20, 44-45), PROJECT.md (§ Architecture, Feature 3, Contract 1)
 */

import { assert, assertEquals } from '../helpers/assert.ts';
import { isPointInsideIslandHitbox, MockTauriBackend } from '../helpers/harness.ts';
import { IslandRect } from '../helpers/types.ts';

Deno.test('Tier 1 / F3-01: Cursor inside notch hitbox disables ignore-cursor-events', () => {
  // Authoritative derivation: PROJECT.md lines 11, 24 & explorer_survey_2 lines 73-86
  const backend = new MockTauriBackend();
  // Standard idle pill bounds: centered in 740px width window
  const notchBounds: IslandRect = { left: 310, top: 0, right: 430, bottom: 34 };
  backend.update_island_bounds(notchBounds);

  // Point at center of notch: (370, 15)
  const ignoring = backend.onCursorMove(370, 15);
  assertEquals(ignoring, false, 'Cursor inside notch must not ignore events');
  assertEquals(backend.clickThroughIgnored, false);
});

Deno.test('Tier 1 / F3-02: Cursor outside notch hitbox enables ignore-cursor-events', () => {
  // Authoritative derivation: PROJECT.md lines 11, 24
  const backend = new MockTauriBackend();
  const notchBounds: IslandRect = { left: 310, top: 0, right: 430, bottom: 34 };
  backend.update_island_bounds(notchBounds);

  // Point far to left outside notch: (50, 100)
  const ignoring = backend.onCursorMove(50, 100);
  assertEquals(ignoring, true, 'Cursor outside notch must ignore cursor events');
  assertEquals(backend.clickThroughIgnored, true);
});

Deno.test('Tier 1 / F3-03: Safety shoulder margins in hit-testing calculation', () => {
  // Authoritative derivation: explorer_survey_2 line 343-346 & explorer_survey_3 line 653-656
  // margins: left-4, right+4, top-2, bottom+6
  const bounds: IslandRect = { left: 300, top: 0, right: 440, bottom: 34 };

  // 3px to left of notch (297, 10) is within 4px safety margin
  assert(isPointInsideIslandHitbox(297, 10, bounds), 'Should fall within left 4px shoulder');

  // 5px to right of notch (445, 10) is outside 4px safety margin
  assert(!isPointInsideIslandHitbox(445, 10, bounds), 'Should fall outside right shoulder');

  // 4px below notch bottom (370, 38) is within 6px bottom safety margin
  assert(isPointInsideIslandHitbox(370, 38, bounds), 'Should fall within bottom 6px margin');
});

Deno.test('Tier 1 / F3-04: Interactive lock overrides cursor hit-testing', () => {
  // Authoritative derivation: PROJECT.md lines 58, 69 & explorer_survey_3 lines 621-631
  // set_interactive_lock(true) locks window into interactive mode
  const backend = new MockTauriBackend();
  backend.set_interactive_lock(true);

  // Move cursor far outside notch: (10, 300)
  const ignoring = backend.onCursorMove(10, 300);
  assertEquals(ignoring, false, 'When locked interactive, cursor events must NOT be ignored');
  assertEquals(backend.clickThroughIgnored, false);

  // Release lock
  backend.set_interactive_lock(false);
  const ignoringAfterUnlock = backend.onCursorMove(10, 300);
  assertEquals(ignoringAfterUnlock, true, 'Once unlocked, cursor outside notch must ignore cursor events');
});

Deno.test('Tier 1 / F3-05: update_island_bounds contract schema and storage', () => {
  // Authoritative derivation: PROJECT.md line 57
  const backend = new MockTauriBackend();
  const expandedLyricsBounds: IslandRect = { left: 45, top: 0, right: 695, bottom: 260 };

  backend.update_island_bounds(expandedLyricsBounds);
  assertEquals(backend.islandBounds.left, 45);
  assertEquals(backend.islandBounds.right, 695);
  assertEquals(backend.islandBounds.bottom, 260);

  // Hit-testing adapts immediately to expanded bounds
  assert(isPointInsideIslandHitbox(100, 200, backend.islandBounds));
});
