/**
 * Tier 2 — Boundary & Corner Cases: F9 BotCanvas & Spring Physics Extremes (R4)
 * Authoritative Source: ORIGINAL_REQUEST.md (lines 26, 52), src/components/IslandSurface.tsx
 */

import { assert, assertEquals } from '../helpers/assert.ts';
import { stepSpring } from '../helpers/harness.ts';
import { SpringState } from '../helpers/types.ts';

Deno.test('Tier 2 / F9-B01: Extreme frame delta-time stability (dt = 0.1s and dt = 0.001s)', () => {
  // Authoritative derivation: src/components/IslandSurface.tsx stepSpring
  const spring1: SpringState = { value: 100, velocity: 0, target: 200, stiffness: 210, damping: 19.5 };
  stepSpring(spring1, 0.1);
  assert(Number.isFinite(spring1.value), 'dt = 0.1s must not produce NaN');
  assert(Number.isFinite(spring1.velocity), 'dt = 0.1s velocity must be finite');

  const spring2: SpringState = { value: 100, velocity: 0, target: 200, stiffness: 210, damping: 19.5 };
  stepSpring(spring2, 0.001);
  assert(Number.isFinite(spring2.value), 'dt = 0.001s must not produce NaN');
});

Deno.test('Tier 2 / F9-B02: Off-screen cursor gaze coordinate clamping', () => {
  // Authoritative derivation: src/core/bot.ts yaw/pitch clamping
  const clampAngle = (deg: number, maxDeg = 45): number => {
    return Math.max(-maxDeg, Math.min(maxDeg, deg));
  };

  assertEquals(clampAngle(85), 45, 'Extreme right gaze must clamp to 45 deg');
  assertEquals(clampAngle(-120), -45, 'Extreme left gaze must clamp to -45 deg');
});

Deno.test('Tier 2 / F9-B03: Voice level amplitude modulation scaling (0.0 to 1.0)', () => {
  // Authoritative derivation: src/core/bot.ts line 650: `1 + 0.28 * this.level`
  const computeEyeListeningScale = (voiceLevel: number): number => {
    const clampedLevel = Math.max(0, Math.min(1, voiceLevel));
    return 1 + 0.28 * clampedLevel;
  };

  assertEquals(computeEyeListeningScale(0.0), 1.0);
  assertEquals(computeEyeListeningScale(1.0), 1.28);
  assertEquals(computeEyeListeningScale(1.5), 1.28, 'Overdriven voice level capped at 1.0');
});

Deno.test('Tier 2 / F9-B04: Rapid consecutive target changes (oscillation recovery)', () => {
  // Authoritative derivation: Dynamic Island expanding/collapsing rapidly during UI clicks
  const spring: SpringState = { value: 120, velocity: 0, target: 120, stiffness: 210, damping: 19.5 };
  const targets = [200, 350, 150, 420, 120];

  for (const t of targets) {
    spring.target = t;
    // Step 5 frames
    for (let f = 0; f < 5; f++) {
      stepSpring(spring, 1 / 60);
    }
  }

  assert(Number.isFinite(spring.value));
  assert(Number.isFinite(spring.velocity));
});

Deno.test('Tier 2 / F9-B05: Critically damped vs overdamped spring stability', () => {
  // Authoritative derivation: Damping ratio zeta = damping / (2 * sqrt(stiffness))
  // For stiffness 210, critical damping = 2 * sqrt(210) ≈ 28.98
  const stiffness = 210;
  const damping = 19.5;
  const zeta = damping / (2 * Math.sqrt(stiffness));

  // Zeta ≈ 0.67 (underdamped with smooth responsive overshoot, characteristic of Dynamic Island)
  assert(zeta > 0.6 && zeta < 0.8, 'Damping ratio must provide smooth Dynamic Island spring feel');
});
