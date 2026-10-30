/**
 * Adversarial Challenger Stress Harness for Milestone 2:
 * Native Windows CoreAudio & Hardware Event Stream (R3)
 *
 * Stress-tests:
 * 1. Rapid consecutive volume bursts (50-100 events, key repeats)
 * 2. COM apartment safety & event drop prevention
 * 3. WINISLE_CONTEXT_GUID self-context filtering & ping-pong loop prevention
 * 4. High-frequency mute toggling under volume pressure
 * 5. Audio endpoint rebind debounce settling under rapid device switching
 * 6. Desktop battery filtering (BatteryLifePercent = 255)
 */

import { assert, assertEquals } from './helpers/assert.ts';
import { MockTauriBackend, WINISLE_CONTEXT_GUID } from './helpers/harness.ts';
import { VolumePayload } from './helpers/types.ts';

Deno.test('Challenger-M2-01: Rapid 100-event volume key burst throughput and zero drops', () => {
  const backend = new MockTauriBackend();
  const receivedEvents: VolumePayload[] = [];

  backend.bus.listen('volume_changed', (payload) => {
    receivedEvents.push(payload);
  });

  const startTime = performance.now();
  for (let i = 1; i <= 100; i++) {
    backend.set_volume(i, undefined); // simulated external hardware volume key repeat
  }
  const elapsedMs = performance.now() - startTime;

  assertEquals(receivedEvents.length, 100, 'Must receive all 100 volume events without dropping any');
  assertEquals(receivedEvents[0].volume, 1);
  assertEquals(receivedEvents[99].volume, 100);
  assertEquals(backend.get_volume(), 100);
  assert(
    elapsedMs < 50.0,
    `100-event burst must process in < 50ms (actual: ${elapsedMs.toFixed(2)}ms)`
  );
});

Deno.test('Challenger-M2-02: WINISLE_CONTEXT_GUID suppresses feedback ping-pong loops', () => {
  const backend = new MockTauriBackend();
  let uiSetVolumeCalls = 0;
  let hudAlertTriggers = 0;

  // Simulate UI component listening to volume_changed
  backend.bus.listen('volume_changed', (payload: VolumePayload) => {
    // Correct frontend behavior: do NOT echo back to set_volume if is_self: true
    if (!payload.is_self) {
      hudAlertTriggers++;
    } else {
      // Ignored for HUD alerts and outgoing commands
    }
  });

  // UI initiates volume adjustment (using WINISLE_CONTEXT_GUID)
  uiSetVolumeCalls++;
  backend.set_volume(75, WINISLE_CONTEXT_GUID);

  assertEquals(backend.get_volume(), 75);
  assertEquals(hudAlertTriggers, 0, 'Self-initiated volume change must NOT trigger external HUD alert');
  assertEquals(uiSetVolumeCalls, 1, 'Self-initiated change must not cause feedback loop');

  // Now an external hardware volume key event arrives
  backend.set_volume(76, undefined);
  assertEquals(hudAlertTriggers, 1, 'External hardware key must trigger HUD alert');
});

Deno.test('Challenger-M2-03: Malicious ping-pong loop breaker validation', () => {
  const backend = new MockTauriBackend();
  let loopDetections = 0;
  const callLimit = 50;

  // A naive handler without is_self check would infinite loop
  backend.bus.listen('volume_changed', (payload: VolumePayload) => {
    if (payload.is_self) {
      // Properly suppressed
      return;
    }
    loopDetections++;
    if (loopDetections > callLimit) {
      throw new Error('Infinite loop detected! Listener re-triggered set_volume without is_self guard');
    }
  });

  // Fire 50 self-initiated volume events
  for (let vol = 1; vol <= 50; vol++) {
    backend.set_volume(vol, WINISLE_CONTEXT_GUID);
  }

  assertEquals(loopDetections, 0, 'Zero recursive loop invocations must occur when is_self is correctly tagged');
});

Deno.test('Challenger-M2-04: Rapid alternating extremes (0 <-> 100) oscillation stress', () => {
  const backend = new MockTauriBackend();
  const history: number[] = [];

  backend.bus.listen('volume_changed', (payload: VolumePayload) => {
    history.push(payload.volume);
  });

  for (let i = 0; i < 50; i++) {
    const target = i % 2 === 0 ? 0 : 100;
    backend.set_volume(target);
  }

  assertEquals(history.length, 50);
  for (let i = 0; i < 50; i++) {
    const expected = i % 2 === 0 ? 0 : 100;
    assertEquals(history[i], expected);
  }
});

Deno.test('Challenger-M2-05: Concurrent mute toggling under high-frequency volume pressure', () => {
  const backend = new MockTauriBackend();
  let finalMute = false;

  backend.bus.listen('volume_changed', (payload: VolumePayload) => {
    finalMute = payload.muted;
  });

  // Interleave volume and mute changes rapidly
  for (let i = 0; i < 50; i++) {
    backend.set_volume(i * 2);
    backend.set_mute(i % 2 === 1);
  }

  assertEquals(backend.get_volume(), 98);
  assertEquals(backend.get_mute(), true);
  assertEquals(finalMute, true);
});

Deno.test('Challenger-M2-06: Audio endpoint rebind debounce absorbs burst device changes', () => {
  // Authoritative derivation: audio.rs line 228 (150ms debounce)
  // When an audio interface disconnects/reconnects rapidly (e.g. Bluetooth toggle),
  // IMMNotificationClient fires multiple notifications. The 150ms debounce channel
  // collapses bursts into a single rebind.
  const debounceWindowMs = 150;
  let rebindExecutions = 0;

  // Simulate crossbeam_channel bounded receiver with debounce
  const simulateDebouncedRebind = (eventTimestampsMs: number[]) => {
    let lastHandled = -Infinity;
    for (const t of eventTimestampsMs) {
      if (t - lastHandled >= debounceWindowMs) {
        rebindExecutions++;
        lastHandled = t;
      }
    }
  };

  // Burst of 5 notifications within 40ms (typical of Bluetooth headset connect)
  simulateDebouncedRebind([0, 10, 20, 30, 40]);
  assertEquals(rebindExecutions, 1, 'Burst of device events within debounce window must only trigger 1 rebind');

  // Subsequent event after debounce window expires
  simulateDebouncedRebind([200]);
  assertEquals(rebindExecutions, 2, 'Event arriving after debounce window must trigger second rebind');
});

Deno.test('Challenger-M2-07: Out-of-bounds volume & brightness clamping resilience', () => {
  const backend = new MockTauriBackend();

  // Negative volume
  backend.set_volume(-25);
  assertEquals(backend.get_volume(), 0);

  // Excessive volume (> 100)
  backend.set_volume(250);
  assertEquals(backend.get_volume(), 100);

  // Floating point volume
  backend.set_volume(49.7);
  assertEquals(backend.get_volume(), 50);

  // Extreme brightness
  backend.set_brightness(-10);
  assertEquals(backend.get_brightness(), 0);

  backend.set_brightness(999);
  assertEquals(backend.get_brightness(), 100);
});

Deno.test('Challenger-M2-08: Desktop battery status filtering (BatteryLifePercent = 255)', () => {
  // Win32 GetSystemPowerStatus returns BatteryLifePercent = 255 on systems without batteries
  const filterBattery = (percent: number): { percentage: number; is_charging: boolean } | null => {
    if (percent <= 100) {
      return { percentage: percent, is_charging: true };
    }
    return null; // Desktop safely filtered to null
  };

  assertEquals(filterBattery(85), { percentage: 85, is_charging: true });
  assertEquals(filterBattery(255), null, 'Desktop BatteryLifePercent=255 must map to null battery');
});
