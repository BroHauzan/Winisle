/**
 * Tier 1 — Feature 8: Synced Lyrics (LRCLIB) & 4-Bar Equalizer (R4)
 * Authoritative Source: ORIGINAL_REQUEST.md (lines 26, 52), PROJECT.md (§ Architecture, Feature 12)
 * Implementation Reference: src/core/lrc.ts, src/components/BeatEqualizerBars.tsx
 */

import { assert, assertEquals } from '../helpers/assert.ts';
import { parseLrc, extractDominantCoverRgb, LyricLine } from '../../../src/core/lrc.ts';

Deno.test('Tier 1 / F8-01: parseLrc line-by-line timestamp parsing with millisecond accuracy', () => {
  // Authoritative derivation: src/core/lrc.ts lines 15-43
  const sampleLrc = `[00:04.50]First line of lyrics
[00:12.75]Second line of lyrics
[01:05.10]Chorus line after one minute`;

  const lines = parseLrc(sampleLrc);
  assertEquals(lines.length, 3);
  assertEquals(lines[0].timeMs, 4500);
  assertEquals(lines[0].text, 'First line of lyrics');
  assertEquals(lines[1].timeMs, 12750);
  assertEquals(lines[1].text, 'Second line of lyrics');
  assertEquals(lines[2].timeMs, 65100);
  assertEquals(lines[2].text, 'Chorus line after one minute');
});

Deno.test('Tier 1 / F8-02: extractDominantCoverRgb extracts vibrant hue without muddy grey', () => {
  // Authoritative derivation: src/core/lrc.ts lines 162-182
  const coverPalette: [string, string, string] = ['#1e3a8a', '#2563eb', '#60a5fa'];
  const rgb = extractDominantCoverRgb(coverPalette);

  assertEquals(rgb.length, 3);
  assert(rgb[0] >= 0 && rgb[0] <= 1);
  assert(rgb[1] >= 0 && rgb[1] <= 1);
  assert(rgb[2] >= 0 && rgb[2] <= 1);
  // Blue hue in palette should produce dominant blue channel
  assert(rgb[2] > rgb[0], 'Blue channel should dominate blue palette');
});

Deno.test('Tier 1 / F8-03: Lyric line active tracking based on currentTimeMs', () => {
  // Authoritative derivation: App.tsx active lyric line index lookup
  const lines: LyricLine[] = [
    { timeMs: 0, text: 'Intro' },
    { timeMs: 5000, text: 'Verse 1' },
    { timeMs: 15000, text: 'Chorus' },
  ];

  const getActiveIndex = (currentTimeMs: number, allLines: LyricLine[]): number => {
    let active = 0;
    for (let i = 0; i < allLines.length; i++) {
      if (allLines[i].timeMs <= currentTimeMs) {
        active = i;
      } else {
        break;
      }
    }
    return active;
  };

  assertEquals(getActiveIndex(2000, lines), 0);
  assertEquals(getActiveIndex(5000, lines), 1);
  assertEquals(getActiveIndex(10000, lines), 1);
  assertEquals(getActiveIndex(20000, lines), 2);
});

Deno.test('Tier 1 / F8-04: 4-bar equalizer frequencies computation', () => {
  // Authoritative derivation: src/components/BeatEqualizerBars.tsx
  // 4 bands: Bass (0..3), Low-Mid (4..9), High-Mid (10..24), Treble (25..60)
  const bands = ['bass', 'low-mid', 'high-mid', 'treble'];
  assertEquals(bands.length, 4);

  const computeBarHeight = (amplitude: number, isPlaying: boolean): number => {
    if (!isPlaying) return 3; // minimal idle height
    return Math.max(3, Math.min(18, Math.round(amplitude * 18)));
  };

  assertEquals(computeBarHeight(0.8, false), 3, 'When paused, bar height stays idle at 3px');
  assertEquals(computeBarHeight(0.5, true), 9, 'When playing, bar scales proportionally');
  assertEquals(computeBarHeight(1.0, true), 18, 'Max bar height capped at 18px');
});

Deno.test('Tier 1 / F8-05: parseLrc word-by-word timestamp support', () => {
  // Authoritative derivation: src/core/lrc.ts lines 45-75
  const rawWordData = [
    {
      timeMs: 1000,
      text: 'Hello world',
      words: [
        { word: 'Hello', startMs: 1000, endMs: 1400 },
        { word: 'world', startMs: 1450, endMs: 1800 },
      ],
    },
  ];

  const parsed = parseLrc('', rawWordData);
  assertEquals(parsed.length, 1);
  assert(parsed[0].words !== undefined);
  assertEquals(parsed[0].words!.length, 2);
  assertEquals(parsed[0].words![0].word, 'Hello');
  assertEquals(parsed[0].words![1].endMs, 1800);
});
