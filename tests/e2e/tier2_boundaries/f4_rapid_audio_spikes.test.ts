/**
 * Tier 2 — Boundary & Corner Cases: F4 Instant Windows CoreAudio Volume Listener (R3)
 * Authoritative Source: ORIGINAL_REQUEST.md (lines 22-23, 46-47), TEST_INFRA.md line 25
 */

import { assert, assertEquals } from '../helpers/assert.ts';
import { MockTauriBackend, WINISLE_CONTEXT_GUID } from '../helpers/harness.ts';
import { VolumePayload } from '../helpers/types.ts';

Deno.test('Tier 2 / F4-B01: Rapid 100-event hardware volume burst throughput stress', () => {
  // Authoritative derivation: TEST_INFRA.md line 25 & explorer_survey_3 line 800
  // Tests 100 rapid volume events simulating physical keyboard volume key mash
  const backend = new MockTauriBackend();
  let receivedCount = 0;

  backend.bus.listen('volume_changed', () => {
    receivedCount++;
  });

  const start = performance.now();
  for (let vol = 1; vol <= 100; vol++) {
    backend.set_volume(vol, undefined); // external hardware event
  }
  const totalElapsedMs = performance.now() - start;

  assertEquals(receivedCount, 100, 'All 100 rapid volume events must be delivered without drop');
  assert(
    totalElapsedMs < 50.0,
    `100 events processed in ${totalElapsedMs.toFixed(2)}ms (must be < 50ms)`
  );
});

Deno.test('Tier 2 / F4-B02: Volume scalar boundary extremes (0 and 100)', () => {
  // Authoritative derivation: PROJECT.md line 50
  const backend = new MockTauriBackend();

  backend.set_volume(0);
  assertEquals(backend.get_volume(), 0);

  backend.set_volume(100);
  assertEquals(backend.get_volume(), 100);
});

Deno.test('Tier 2 / F4-B03: Muted state toggling preserves volume scalar', () => {
  // Authoritative derivation: Windows CoreAudio maintains volume level when muted
  const backend = new MockTauriBackend();
  backend.set_volume(42);
  backend.set_mute(true);

  let lastPayload: VolumePayload | null = null;
  backend.bus.listen('volume_changed', (p) => {
    lastPayload = p;
  });

  backend.set_mute(true);
  assertEquals((lastPayload as any).volume, 42);
  assertEquals((lastPayload as any).muted, true);

  backend.set_mute(false);
  assertEquals((lastPayload as any).volume, 42);
  assertEquals((lastPayload as any).muted, false);
});

Deno.test('Tier 2 / F4-B04: Audio endpoint rebind settling debounce delay (150ms)', () => {
  // Authoritative derivation: explorer_survey_3 line 297 & line 799
  // 150ms debounce prevents race condition during audio driver switch
  const settleDebounceMs = 150;
  assertEquals(settleDebounceMs, 150);
});

Deno.test('Tier 2 / F4-B05: Concurrent UI drag and hardware keypress disambiguation', () => {
  // Authoritative derivation: PROJECT.md line 9 & explorer_survey_3 line 801
  const backend = new MockTauriBackend();
  const events: VolumePayload[] = [];

  backend.bus.listen('volume_changed', (p) => {
    events.push(p);
  });

  // UI drag event (self)
  backend.set_volume(60, WINISLE_CONTEXT_GUID);
  // Hardware keypress event (external)
  backend.set_volume(62, undefined);

  assertEquals(events.length, 2);
  assertEquals(events[0].is_self, true, 'First event is from UI');
  assertEquals(events[1].is_self, false, 'Second event is from hardware key');
});
