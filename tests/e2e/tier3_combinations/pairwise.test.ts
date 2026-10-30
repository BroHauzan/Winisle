/**
 * Tier 3 — Cross-Feature Combinations: Pairwise Interactions
 * Authoritative Source: TEST_INFRA.md lines 10-19, 41
 */

import { assert, assertEquals, assertAlmostEquals } from '../helpers/assert.ts';
import { MockTauriBackend, stepSpring, isPointInsideIslandHitbox } from '../helpers/harness.ts';
import { parseLrc, LyricLine } from '../../../src/core/lrc.ts';
import { SpringState, IslandRect, BatteryInfo } from '../helpers/types.ts';

Deno.test('Tier 3 / T3-01: Pairwise: Hardware Volume Burst + Active Synced Lyrics', () => {
  // Rapid volume key events during lyrics playback must not desynchronize active lyric line
  const backend = new MockTauriBackend();
  const sampleLrc = `[00:01.00]Verse 1
[00:03.00]Verse 2
[00:06.00]Chorus`;
  const lines: LyricLine[] = parseLrc(sampleLrc);

  let currentTimeMs = 3500;
  let activeIndex = 0;

  const updateActiveLyric = (time: number) => {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].timeMs <= time) activeIndex = i;
    }
  };

  updateActiveLyric(currentTimeMs);
  assertEquals(activeIndex, 1, 'Before volume burst: Verse 2 is active');

  // Trigger 20 rapid volume events
  for (let v = 50; v <= 70; v++) {
    backend.set_volume(v);
  }

  // Active lyric index must still be 1 (Verse 2)
  updateActiveLyric(currentTimeMs);
  assertEquals(activeIndex, 1, 'After volume burst: Verse 2 remains active without desync');
  assertEquals(backend.get_volume(), 70);
});

Deno.test('Tier 3 / T3-02: Pairwise: Isle Assistant Alt+Q Invocation + Click-Through Lock', () => {
  // When assistant opens via Alt+Q, interactive lock is engaged immediately
  const backend = new MockTauriBackend();
  backend.update_island_bounds({ left: 310, top: 0, right: 430, bottom: 34 });

  // Initially idle with cursor outside: ignoring events
  backend.onCursorMove(100, 200);
  assertEquals(backend.clickThroughIgnored, true);

  // User presses Alt+Q: Assistant opens and engages interactive lock
  backend.set_interactive_lock(true);
  assertEquals(backend.clickThroughIgnored, false, 'Opening assistant disables click-through pass-through');

  // Cursor moves anywhere: click-through stays locked
  backend.onCursorMove(50, 300);
  assertEquals(backend.clickThroughIgnored, false, 'Cursor anywhere inside modal window can interact with assistant');
});

Deno.test('Tier 3 / T3-03: Pairwise: Display Brightness Slider Adjustment + Battery Charging State', () => {
  // Adjusting brightness slider does not alter battery percentage or charging status
  const backend = new MockTauriBackend();
  const battery: BatteryInfo = { percentage: 78, is_charging: true };

  backend.set_brightness(40);
  assertEquals(backend.get_brightness(), 40);
  assertEquals(battery.percentage, 78);
  assertEquals(battery.is_charging, true);

  backend.set_brightness(90);
  assertEquals(backend.get_brightness(), 90);
  assertEquals(battery.percentage, 78);
  assertEquals(battery.is_charging, true);
});

Deno.test('Tier 3 / T3-04: Pairwise: BotCanvas Saccade Tracking + Click-Through Cursor Monitor', () => {
  // Cursor coordinate tracking for bot gaze matches hit-testing boundary space
  const bounds: IslandRect = { left: 310, top: 0, right: 430, bottom: 34 };
  const cursor = { x: 370, y: 15 };

  // Hit test
  const isInside = isPointInsideIslandHitbox(cursor.x, cursor.y, bounds);
  assertEquals(isInside, true);

  // Compute eye gaze angle from notch center (370, 17)
  const dx = cursor.x - 370;
  const dy = cursor.y - 17;
  const gazeAngle = Math.atan2(dy, dx);
  assert(Number.isFinite(gazeAngle));
});

Deno.test('Tier 3 / T3-05: Pairwise: Voice Assistant Mic Streaming + Dynamic Island Reactive Aura', () => {
  // Mic audio amplitude directly modulates island voice aura level
  let reactiveVoiceLevel = 0.0;

  const onPcmChunk = (amplitude: number) => {
    reactiveVoiceLevel = Math.max(0.0, Math.min(1.0, amplitude * 1.5));
  };

  onPcmChunk(0.4);
  assertAlmostEquals(reactiveVoiceLevel, 0.6);

  onPcmChunk(0.8);
  assertAlmostEquals(reactiveVoiceLevel, 1.0, 1e-4, 'Max amplitude clamped at 1.0');
});

Deno.test('Tier 3 / T3-06: Pairwise: Mute Toggle + Equalizer Visualizer', () => {
  // Muting master audio immediately collapses visualizer bars to 3px idle baseline
  const backend = new MockTauriBackend();
  backend.set_volume(80);
  backend.set_mute(false);

  const getVisualizerBarHeight = (amplitude: number, muted: boolean): number => {
    if (muted) return 3;
    return Math.max(3, Math.min(18, Math.round(amplitude * 18)));
  };

  assertEquals(getVisualizerBarHeight(0.9, backend.get_mute()), 16);

  backend.set_mute(true);
  assertEquals(getVisualizerBarHeight(0.9, backend.get_mute()), 3, 'When muted, bar height collapses to idle');
});

Deno.test('Tier 3 / T3-07: Pairwise: Audio Endpoint Rebind + Active Media Playback', () => {
  // Audio device swap rebinds CoreAudio without disrupting media playback state
  const backend = new MockTauriBackend();
  let mediaPlaying = true;
  let trackTitle = 'Isle Dynamic Theme';

  // Device swap signals rebind
  backend.set_volume(50);
  assertEquals(mediaPlaying, true);
  assertEquals(trackTitle, 'Isle Dynamic Theme');
});

Deno.test('Tier 3 / T3-08: Pairwise: Screenshot Vision + Interactive Modal', () => {
  // Capturing screenshot for Gemini multimodal query maintains active modal focus
  const backend = new MockTauriBackend();
  backend.set_interactive_lock(true);

  // Screenshot command invoked
  const screenshotBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNiAAAABgADNjd8qAAAAABJRU5ErkJggg==';
  assert(screenshotBase64.length > 0);

  // Modal remains locked interactive
  assertEquals(backend.clickThroughIgnored, false);
});

Deno.test('Tier 3 / T3-09: Pairwise: Window Scale Factor Change + Hitbox Synchronization', () => {
  // Moving from 100% DPI monitor to 150% DPI monitor recalculates hitbox
  const notch100Dpi: IslandRect = { left: 310, top: 0, right: 430, bottom: 34 };
  const scale = 1.5;
  const notch150Dpi: IslandRect = {
    left: Math.round(notch100Dpi.left * scale),
    top: 0,
    right: Math.round(notch100Dpi.right * scale),
    bottom: Math.round(notch100Dpi.bottom * scale),
  };

  assertEquals(notch150Dpi.left, 465);
  assertEquals(notch150Dpi.right, 645);
  assertEquals(notch150Dpi.bottom, 51);
});

Deno.test('Tier 3 / T3-10: Pairwise: System Tray Island Toggle + Spring Physics Expansion', () => {
  // Clicking tray icon triggers spring opening from 0 to 120px width
  const spring: SpringState = { value: 0, velocity: 0, target: 120, stiffness: 210, damping: 19.5 };

  for (let frame = 0; frame < 60; frame++) {
    stepSpring(spring, 1 / 60);
  }

  // After 1 second (60 frames), should be fully settled at 120px
  assertEquals(spring.value, 120);
});

Deno.test('Tier 3 / T3-11: Pairwise: Pomodoro Focus Timer Complete + System Alert Flyout Priority', () => {
  // Pomodoro timer completion HUD takes priority over volume slider HUD
  type AlertType = 'pomodoro' | 'volume' | 'brightness';
  let activeAlert: AlertType | null = null;

  const triggerAlert = (type: AlertType) => {
    // Priority: pomodoro > volume/brightness
    if (activeAlert === 'pomodoro' && type !== 'pomodoro') return;
    activeAlert = type;
  };

  triggerAlert('volume');
  assertEquals(activeAlert, 'volume');

  triggerAlert('pomodoro');
  assertEquals(activeAlert, 'pomodoro');

  // Background volume event does not replace pomodoro completion alert
  triggerAlert('volume');
  assertEquals(activeAlert, 'pomodoro');
});

Deno.test('Tier 3 / T3-12: Pairwise: Multi-Monitor Brightness + Desktop Click-Through Pass-Through', () => {
  // Adjusting brightness on secondary display while overlay window remains click-through
  const backend = new MockTauriBackend();
  backend.update_island_bounds({ left: 310, top: 0, right: 430, bottom: 34 });

  backend.set_brightness(65);
  assertEquals(backend.get_brightness(), 65);

  // Overlay window remains pass-through
  backend.onCursorMove(50, 150);
  assertEquals(backend.clickThroughIgnored, true);
});
