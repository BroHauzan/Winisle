/**
 * Tier 2 — Boundary & Corner Cases: F8 Synced Lyrics & Visualizer (R4)
 * Authoritative Source: ORIGINAL_REQUEST.md (lines 26, 52), src/core/lrc.ts
 */

import { assert, assertEquals } from '../helpers/assert.ts';
import { parseLrc, extractDominantCoverRgb } from '../../../src/core/lrc.ts';

Deno.test('Tier 2 / F8-B01: Malformed timestamp lines skipped gracefully without crash', () => {
  // Authoritative derivation: src/core/lrc.ts lines 15-42
  const corruptedLrc = `[invalid:time]Corrupted line 1
[99:99.99]Out of range seconds
[--:--.--]Dashes
[00:15.50]Valid line 1
[not_a_time]Corrupted line 2
[00:20.00]Valid line 2`;

  const lines = parseLrc(corruptedLrc);
  assertEquals(lines.length, 2);
  assertEquals(lines[0].timeMs, 15500);
  assertEquals(lines[0].text, 'Valid line 1');
  assertEquals(lines[1].timeMs, 20000);
  assertEquals(lines[1].text, 'Valid line 2');
});

Deno.test('Tier 2 / F8-B02: Out-of-order timestamps sorted chronologically', () => {
  // Authoritative derivation: src/core/lrc.ts sorting invariant
  const unsortedLrc = `[00:30.00]Line 3
[00:10.00]Line 1
[00:20.00]Line 2`;

  const lines = parseLrc(unsortedLrc);
  assertEquals(lines.length, 3);
  assertEquals(lines[0].text, 'Line 1');
  assertEquals(lines[1].text, 'Line 2');
  assertEquals(lines[2].text, 'Line 3');
});

Deno.test('Tier 2 / F8-B03: Instrumental / empty track lyrics parsing', () => {
  // Authoritative derivation: src/core/lrc.ts
  const emptyLrc = '';
  const lines = parseLrc(emptyLrc);
  assertEquals(lines.length, 0);

  const whitespaceLrc = '   \n\n\t   ';
  const whitespaceLines = parseLrc(whitespaceLrc);
  assertEquals(whitespaceLines.length, 0);
});

Deno.test('Tier 2 / F8-B04: Long duration podcast / live set timestamps (> 2 hours)', () => {
  // Authoritative derivation: src/core/lrc.ts lines 21-22 (supports minutes up to 9999)
  const longLrc = `[135:45.50]Over 2 hours in`;
  const lines = parseLrc(longLrc);

  assertEquals(lines.length, 1);
  const expectedMs = 135 * 60_000 + 45_000 + 500;
  assertEquals(lines[0].timeMs, expectedMs);
});

Deno.test('Tier 2 / F8-B05: Monochromatic / grayscale palette zero-saturation handling', () => {
  // Authoritative derivation: src/core/lrc.ts lines 162-182
  // Pure greys (r === g === b) have saturation = 0; must not produce NaN or error
  const grayscalePalette: [string, string, string] = ['#222222', '#555555', '#888888'];
  const rgb = extractDominantCoverRgb(grayscalePalette);

  assert(rgb.length === 3);
  assert(Number.isFinite(rgb[0]));
  assert(Number.isFinite(rgb[1]));
  assert(Number.isFinite(rgb[2]));
});
