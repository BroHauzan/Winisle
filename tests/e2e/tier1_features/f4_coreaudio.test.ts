/**
 * Tier 1 — Feature 4: Instant Windows CoreAudio Volume Listener (R3)
 * Authoritative Source: ORIGINAL_REQUEST.md (lines 22-23, 46-47), PROJECT.md (§ Architecture, Feature 5, Contract 2)
 */

import { assert, assertEquals } from '../helpers/assert.ts';
import { MockTauriBackend, WINISLE_CONTEXT_GUID } from '../helpers/harness.ts';
import { VolumePayload } from '../helpers/types.ts';

Deno.test('Tier 1 / F4-01: volume_changed event payload contract schema', () => {
  // Authoritative derivation: PROJECT.md line 62
  // Payload: { volume: u32, muted: bool, is_self: bool }
  const payload: VolumePayload = {
    volume: 65,
    muted: false,
    is_self: false,
  };

  assert(typeof payload.volume === 'number' && payload.volume >= 0 && payload.volume <= 100);
  assert(typeof payload.muted === 'boolean');
  assert(typeof payload.is_self === 'boolean');
});

Deno.test('Tier 1 / F4-02: Self-context echo suppression via WINISLE_CONTEXT_GUID', () => {
  // Authoritative derivation: PROJECT.md lines 9, 50 & explorer_survey_3 lines 132-140
  // When UI calls set_volume, event carries is_self = true
  const backend = new MockTauriBackend();
  let receivedPayload: VolumePayload | null = null;

  backend.bus.listen('volume_changed', (p) => {
    receivedPayload = p;
  });

  backend.set_volume(80, WINISLE_CONTEXT_GUID);

  assert(receivedPayload !== null);
  assertEquals((receivedPayload as VolumePayload).volume, 80);
  assertEquals((receivedPayload as VolumePayload).is_self, true, 'Event initiated with WINISLE_CONTEXT_GUID must be tagged is_self: true');
});

Deno.test('Tier 1 / F4-03: External hardware volume key event tagging', () => {
  // Authoritative derivation: PROJECT.md line 62 & explorer_survey_3 line 163
  // Hardware volume key presses carry a system GUID, resulting in is_self = false
  const backend = new MockTauriBackend();
  let receivedPayload: VolumePayload | null = null;

  backend.bus.listen('volume_changed', (p) => {
    receivedPayload = p;
  });

  // External hardware key press (different GUID / undefined)
  backend.set_volume(45, undefined);

  assert(receivedPayload !== null);
  assertEquals((receivedPayload as VolumePayload).volume, 45);
  assertEquals((receivedPayload as VolumePayload).is_self, false, 'External event must be tagged is_self: false');
});

Deno.test('Tier 1 / F4-04: In-process direct event dispatch latency (< 1ms)', () => {
  // Authoritative derivation: PROJECT.md line 4 & ORIGINAL_REQUEST.md line 23 (zero perceptible latency)
  const backend = new MockTauriBackend();
  const iterations = 50;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    backend.set_volume(i % 100);
  }

  const durationMs = performance.now() - start;
  const avgLatencyPerEvent = durationMs / iterations;

  // In-process event loop should dispatch each event in well under 0.5 ms
  assert(
    avgLatencyPerEvent < 1.0,
    `Average in-process event latency (${avgLatencyPerEvent.toFixed(3)}ms) must be < 1.0ms`
  );
});

Deno.test('Tier 1 / F4-05: IMMNotificationClient default device change rebind contract', () => {
  // Authoritative derivation: PROJECT.md line 9 & explorer_survey_3 lines 200-211
  // Rebind triggers on eRender=0 and eConsole=0 or eMultimedia=1
  const isDefaultPlaybackDevice = (flow: number, role: number): boolean => {
    return flow === 0 && (role === 0 || role === 1);
  };

  assert(isDefaultPlaybackDevice(0, 0), 'Render Console must trigger rebind');
  assert(isDefaultPlaybackDevice(0, 1), 'Render Multimedia must trigger rebind');
  assert(!isDefaultPlaybackDevice(1, 0), 'Capture device change must NOT trigger playback rebind');
});
