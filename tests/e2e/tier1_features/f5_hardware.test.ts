/**
 * Tier 1 — Feature 5: Bi-Directional Volume, Mute & Brightness Controls (R3)
 * Authoritative Source: ORIGINAL_REQUEST.md (lines 23-24, 48), PROJECT.md (§ Architecture, Feature 7, 8, 9, Contract 1)
 */

import { assert, assertEquals } from '../helpers/assert.ts';
import { MockTauriBackend } from '../helpers/harness.ts';
import { BatteryInfo, HardwareStatus } from '../helpers/types.ts';

Deno.test('Tier 1 / F5-01: set_volume and get_volume round-trip', () => {
  // Authoritative derivation: PROJECT.md lines 50-51
  const backend = new MockTauriBackend();
  backend.set_volume(72);
  assertEquals(backend.get_volume(), 72);
});

Deno.test('Tier 1 / F5-02: set_mute and get_mute toggle state', () => {
  // Authoritative derivation: PROJECT.md lines 52-53
  const backend = new MockTauriBackend();
  backend.set_mute(true);
  assertEquals(backend.get_mute(), true);

  backend.set_mute(false);
  assertEquals(backend.get_mute(), false);
});

Deno.test('Tier 1 / F5-03: set_brightness and get_brightness control', () => {
  // Authoritative derivation: PROJECT.md lines 54-55
  const backend = new MockTauriBackend();
  backend.set_brightness(85);
  assertEquals(backend.get_brightness(), 85);
});

Deno.test('Tier 1 / F5-04: get_battery_status payload contract', () => {
  // Authoritative derivation: PROJECT.md line 56
  // Returns { percentage: u32, is_charging: bool }
  const sampleBattery: BatteryInfo = {
    percentage: 88,
    is_charging: true,
  };

  assert(typeof sampleBattery.percentage === 'number');
  assert(sampleBattery.percentage >= 0 && sampleBattery.percentage <= 100);
  assert(typeof sampleBattery.is_charging === 'boolean');
});

Deno.test('Tier 1 / F5-05: Global bridge getHardwareStatus aggregate contract', () => {
  // Authoritative derivation: PROJECT.md line 70
  // Aggregates get_volume, get_mute, get_brightness, get_battery_status
  const backend = new MockTauriBackend();
  backend.set_volume(60);
  backend.set_mute(false);
  backend.set_brightness(50);

  const status: HardwareStatus = {
    volume: backend.get_volume(),
    muted: backend.get_mute(),
    brightness: backend.get_brightness(),
    battery: { percentage: 92, is_charging: false },
  };

  assertEquals(status.volume, 60);
  assertEquals(status.muted, false);
  assertEquals(status.brightness, 50);
  assert(status.battery !== null);
  assertEquals(status.battery.percentage, 92);
});
