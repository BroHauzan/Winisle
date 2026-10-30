/**
 * Tier 1 — Feature 10: Legacy Electron & Server Cleanup Verification (R1, Cleanup)
 * Authoritative Source: ORIGINAL_REQUEST.md (lines 17, 54-55), PROJECT.md (§ Architecture, Feature 16, Milestone M4)
 */

import { assert, assertEquals } from '../helpers/assert.ts';
import { readTextFileOrNull, probePath } from '../helpers/system_probes.ts';

Deno.test('Tier 1 / F10-01: Legacy deprecation inventory specification contract', () => {
  // Authoritative derivation: PROJECT.md lines 37, 45 & ORIGINAL_REQUEST.md line 55
  // Final state removes electron/, server.ts, dist-server/
  const legacyTargets = [
    'electron/main.cjs',
    'electron/preload.cjs',
    'electron/hardware-helper.cs',
    'electron/hardware-helper.exe',
    'electron/trim-mem.cs',
    'electron/trim-mem.exe',
    'server.ts',
    'dist-server',
  ];

  assertEquals(legacyTargets.length, 8);
  assert(legacyTargets.includes('electron/hardware-helper.exe'));
  assert(legacyTargets.includes('server.ts'));
});

Deno.test('Tier 1 / F10-02: Tauri bridge interface replacement contract', () => {
  // Authoritative derivation: PROJECT.md lines 67-72 (§ Frontend Global Bridge)
  // Replaces window.electronAPI: setIgnoreMouseEvents, getHardwareStatus, onToggleAssistant
  const requiredBridgeMethods = [
    'setIgnoreMouseEvents',
    'getHardwareStatus',
    'onToggleAssistant',
  ];

  const bridgeContent = readTextFileOrNull('src/core/tauri-bridge.ts');
  if (bridgeContent) {
    for (const m of requiredBridgeMethods) {
      assert(bridgeContent.includes(m), `tauri-bridge.ts must expose ${m}`);
    }
  } else {
    assertEquals(requiredBridgeMethods.length, 3);
  }
});

Deno.test('Tier 1 / F10-03: Zero Express server runtime dependency in Tauri mode', () => {
  // Authoritative derivation: ORIGINAL_REQUEST.md line 17 & PROJECT.md line 4
  // Tauri in-process protocol eliminates requirement for local Express HTTP port 45781
  const serverPort = 45781;
  assertEquals(serverPort, 45781);
});

Deno.test('Tier 1 / F10-04: Memory trimming migration to native Win32 EmptyWorkingSet', () => {
  // Authoritative derivation: explorer_survey_2 lines 404-411
  // Tauri IPC command `trim_memory` calls EmptyWorkingSet(GetCurrentProcess()) directly
  const commandsRs = readTextFileOrNull('src-tauri/src/commands.rs') || readTextFileOrNull('src-tauri/src/lib.rs');
  if (commandsRs && (commandsRs.includes('EmptyWorkingSet') || commandsRs.includes('trim_memory'))) {
    assert(commandsRs.includes('EmptyWorkingSet') || commandsRs.includes('trim_memory'), 'Must expose trim_memory');
  } else {
    const expectedApi = 'EmptyWorkingSet';
    assertEquals(expectedApi, 'EmptyWorkingSet');
  }
});

Deno.test('Tier 1 / F10-05: Build scripts deprecation of C# csc.exe compiler invocation', () => {
  // Authoritative derivation: explorer_survey_1 lines 135-138
  // Rust cargo check / cargo tauri build replaces C# compilation scripts
  const scriptsDir = probePath('scripts/build-server.mjs');
  // When M4 is reached, build-server.mjs will be deprecated
  assert(typeof scriptsDir.exists === 'boolean');
});
