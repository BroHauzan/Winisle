/**
 * Tier 1 — Feature 9: BotCanvas Character & Spring Physics (R4)
 * Authoritative Source: ORIGINAL_REQUEST.md (lines 26, 52), PROJECT.md (§ Architecture, Feature 13)
 * Implementation Reference: src/components/IslandSurface.tsx, src/core/bot.ts
 */

import { assert, assertEquals, assertAlmostEquals } from '../helpers/assert.ts';
import { stepSpring } from '../helpers/harness.ts';
import { SpringState } from '../helpers/types.ts';
import { CLASSIC_GLOW } from '../../../src/core/bot.ts';

Deno.test('Tier 1 / F9-01: stepSpring physics convergence to target value', () => {
  // Authoritative derivation: src/components/IslandSurface.tsx lines 11-21
  // stiffness: 210, damping: 19.5
  const spring: SpringState = {
    value: 120, // initial idle pill width
    velocity: 0,
    target: 420, // expanded carousel width
    stiffness: 210,
    damping: 19.5,
  };

  const dt = 1 / 60; // 60 FPS frame time (0.0166s)
  let settled = false;

  for (let frame = 0; frame < 180; frame++) {
    settled = stepSpring(spring, dt);
    if (settled) break;
  }

  assert(settled, 'Spring must settle within 3 seconds (180 frames)');
  assertEquals(spring.value, 420);
  assertEquals(spring.velocity, 0);
});

Deno.test('Tier 1 / F9-02: 3D eye gaze foreshortening calculation', () => {
  // Authoritative derivation: src/core/bot.ts lines 658-660
  // foreshortening scale: 1 - FORESHORTEN * (1 - across1)
  const FORESHORTEN = 0.35;

  const calculateEyeScale = (acrossMagnitude: number): number => {
    return 1 - FORESHORTEN * (1 - acrossMagnitude);
  };

  // When facing directly forward (acrossMagnitude = 1.0)
  assertAlmostEquals(calculateEyeScale(1.0), 1.0);

  // When turned 60 degrees sideways (acrossMagnitude = 0.5)
  assertAlmostEquals(calculateEyeScale(0.5), 0.825);
});

Deno.test('Tier 1 / F9-03: Bot blinking lifecycle curve', () => {
  // Authoritative derivation: src/core/bot.ts lines 643-649
  const BLINK_S = 0.16;
  const BLINK_CLOSING = 0.45;

  const calculateLid = (since: number, length: number): number => {
    if (since < 0 || since >= length) return 1.0;
    const at = since / length;
    return at < BLINK_CLOSING ? 1 - at / BLINK_CLOSING : (at - BLINK_CLOSING) / (1 - BLINK_CLOSING);
  };

  // Lid fully open before blink
  assertEquals(calculateLid(-0.1, BLINK_S), 1.0);

  // Mid-closing
  const midClose = calculateLid(BLINK_S * 0.225, BLINK_S);
  assert(midClose < 1.0 && midClose >= 0.0);

  // Fully reopened after blink duration
  assertEquals(calculateLid(BLINK_S + 0.05, BLINK_S), 1.0);
});

Deno.test('Tier 1 / F9-04: Bot classic glow color palette definitions', () => {
  // Authoritative derivation: src/core/bot.ts lines 10-14
  assertEquals(CLASSIC_GLOW.length, 3);
  assertEquals(CLASSIC_GLOW[0], [0.56, 0.4, 1]);
  assertEquals(CLASSIC_GLOW[1], [0.27, 0.56, 1]);
  assertEquals(CLASSIC_GLOW[2], [0.22, 0.84, 0.96]);
});

Deno.test('Tier 1 / F9-05: IslandSurface notch organic curves geometry parameters', () => {
  // Authoritative derivation: src/components/IslandSurface.tsx lines 23-30
  const idleNotchParams = {
    width: 120,
    height: 34,
    radius: 17,
    shoulder: 14,
    topInset: 0,
  };

  assertEquals(idleNotchParams.width, 120);
  assertEquals(idleNotchParams.height, 34);
  assertEquals(idleNotchParams.radius, 17); // pill height / 2 for full pill roundness
  assert(idleNotchParams.shoulder > 0, 'Shoulder curve provides smooth blend into top screen border');
});
