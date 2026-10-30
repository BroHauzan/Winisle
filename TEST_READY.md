# WinIsle E2E Test Suite — TEST_READY

## Test Suite Overview
- **Status**: READY & VERIFIED
- **Total Test Cases**: 118 tests (Threshold ≥ 115 MET)
- **Passing**: 118 / 118 (100% Pass Rate)
- **Failing**: 0
- **Execution Time**: ~1.5 – 2.0 seconds
- **Test Framework**: Native Deno 2.7+ TypeScript Test Harness (`tests/deno.json`)
- **Authoritative Base**: `ORIGINAL_REQUEST.md`, `PROJECT.md`, `TEST_INFRA.md`

---

## Test Execution Commands

### 1. Unified CLI Runner (with Structured Summary)
```powershell
deno run -A --config tests/deno.json tests/e2e/runner.ts
```

### 2. Direct Deno Test Suite Execution
```powershell
deno test --config tests/deno.json -A tests/e2e/
```

### 3. Individual Tier Execution
```powershell
# Tier 1: Feature Coverage (50 tests)
deno test --config tests/deno.json -A tests/e2e/tier1_features/

# Tier 2: Boundary & Corner Cases (50 tests)
deno test --config tests/deno.json -A tests/e2e/tier2_boundaries/

# Tier 3: Cross-Feature Combinations (12 tests)
deno test --config tests/deno.json -A tests/e2e/tier3_combinations/

# Tier 4: Real-World Scenarios (6 tests)
deno test --config tests/deno.json -A tests/e2e/tier4_scenarios/
```

---

## Coverage Breakdown by Tier

| Tier | Category / Scope | Test Files | Tests | Status |
| :--- | :--- | :--- | :---: | :---: |
| **Tier 1: Feature Coverage** | Primary happy-path coverage (≥5 per feature across F1–F10) | 10 files in `tests/e2e/tier1_features/` | 50 | PASS (50/50) |
| **Tier 2: Boundary & Corner Cases** | Edge coordinates, rapid spikes, clippers, anomalies | 10 files in `tests/e2e/tier2_boundaries/` | 50 | PASS (50/50) |
| **Tier 3: Cross-Feature Combinations** | Pairwise interactions (volume+lyrics, assistant+lock, etc.) | `tests/e2e/tier3_combinations/pairwise.test.ts` | 12 | PASS (12/12) |
| **Tier 4: Real-World Scenarios** | End-to-end user workflows (cold boot, audio burst, Alt+Q) | `tests/e2e/tier4_scenarios/workflows.test.ts` | 6 | PASS (6/6) |
| **TOTAL** | **Full Opaque-Box E2E Test Suite** | **23 test files & runner** | **118** | **PASS (118/118)** |

---

## Feature Category Inventory Mapping (F1–F10)

| # | Feature Category | Source Requirement | Tier 1 (Coverage) | Tier 2 (Boundaries) | Tier 3 (Pairwise) | Tier 4 (Workflows) |
|---|------------------|-------------------|:-----------------:|:-------------------:|:-----------------:|:------------------:|
| **F1** | Tauri 2.0 Scaffold & 5–10MB Size Profile | R1 | 5 tests (`f1_tauri_arch`) | 5 tests (`f1_arch_boundaries`) | ✓ (T3-09, T3-10) | ✓ (W1, W5) |
| **F2** | Frameless Transparent Overlay (No White Box) | R2 | 5 tests (`f2_overlay`) | 5 tests (`f2_overlay_bounds`) | ✓ (T3-09, T3-12) | ✓ (W1, W4) |
| **F3** | Click-Through & Dynamic Hit-Testing | R2 | 5 tests (`f3_clickthrough`) | 5 tests (`f3_hit_test_corners`) | ✓ (T3-02, T3-04) | ✓ (W1, W3, W4) |
| **F4** | Instant CoreAudio Volume Event Stream | R3 | 5 tests (`f4_coreaudio`) | 5 tests (`f4_rapid_audio_spikes`) | ✓ (T3-01, T3-06) | ✓ (W2, W6) |
| **F5** | Bi-Directional Volume, Mute & Brightness | R3 | 5 tests (`f5_hardware`) | 5 tests (`f5_hardware_clamping`) | ✓ (T3-03, T3-06) | ✓ (W2, W4, W6) |
| **F6** | Gemini 3.8 Assistant & Alt+Q Shortcut | R4 | 5 tests (`f6_assistant`) | 5 tests (`f6_assistant_limits`) | ✓ (T3-02, T3-08) | ✓ (W3) |
| **F7** | Multimodal Live Voice & Screenshot Vision | R4 | 5 tests (`f7_live_voice`) | 5 tests (`f7_voice_vision_stress`)| ✓ (T3-05, T3-08) | ✓ (W3) |
| **F8** | Synced Lyrics (LRCLIB) & 4-Bar Equalizer | R4 | 5 tests (`f8_lyrics`) | 5 tests (`f8_lyrics_anomalies`) | ✓ (T3-01, T3-06) | ✓ (W2) |
| **F9** | BotCanvas Character & Spring Physics | R4 | 5 tests (`f9_bot_canvas`) | 5 tests (`f9_physics_extremes`) | ✓ (T3-04, T3-05) | ✓ (W1) |
| **F10**| Legacy Electron & Server Cleanup | R1, Cleanup | 5 tests (`f10_cleanup`) | 5 tests (`f10_legacy_traps`) | ✓ (T3-10, T3-11) | ✓ (W5) |

---

## Detailed Test Directory Structure

```
tests/
├── deno.json                       # Deno test configuration (compilerOptions: deno.ns + dom)
├── e2e/
│   ├── helpers/
│   │   ├── assert.ts              # Robust zero-dependency assertions with deep equality
│   │   ├── harness.ts             # Spring physics simulator, hit-testing & Mock Tauri IPC
│   │   ├── system_probes.ts       # Workspace probes, file stat & binary footprint inspection
│   │   └── types.ts               # Interface contracts & schema definitions
│   ├── tier1_features/
│   │   ├── f1_tauri_arch.test.ts  # F1: Tauri profile, LTO, window specs, permissions (5 tests)
│   │   ├── f2_overlay.test.ts     # F2: DWM glass margins [-1,-1,-1,-1], transparent styling (5 tests)
│   │   ├── f3_clickthrough.test.ts# F3: Adaptive hit-test, safety shoulders, lock override (5 tests)
│   │   ├── f4_coreaudio.test.ts   # F4: CoreAudio events, WINISLE_CONTEXT_GUID, rebind (5 tests)
│   │   ├── f5_hardware.test.ts    # F5: Volume/mute/brightness round-trip, battery info (5 tests)
│   │   ├── f6_assistant.test.ts   # F6: Alt+Q shortcut, assistant modes, API key masking (5 tests)
│   │   ├── f7_live_voice.test.ts  # F7: 16kHz PCM, 24kHz decode, screenshot capture (5 tests)
│   │   ├── f8_lyrics.test.ts      # F8: parseLrc millisecond timing, cover hue extract (5 tests)
│   │   ├── f9_bot_canvas.test.ts  # F9: stepSpring convergence, 3D eyes, blink cycle (5 tests)
│   │   └── f10_cleanup.test.ts    # F10: Deprecation inventory, bridge replacement (5 tests)
│   ├── tier2_boundaries/
│   │   ├── f1_arch_boundaries.test.ts    # Size limit ≤10MB, bundle ceiling, CSP (5 tests)
│   │   ├── f2_overlay_bounds.test.ts     # Multi-res top-center (1366 to 4K), DPI scaling (5 tests)
│   │   ├── f3_hit_test_corners.test.ts   # 2000px/s sweep, exact corner rects, 150ms sleep (5 tests)
│   │   ├── f4_rapid_audio_spikes.test.ts # 100-event volume burst in <50ms, scalar 0 & 100 (5 tests)
│   │   ├── f5_hardware_clamping.test.ts  # Out-of-bounds volume/brightness clamps, battery=255 (5 tests)
│   │   ├── f6_assistant_limits.test.ts   # Alt+Q double-tap toggle, 10k char prompts, backoff (5 tests)
│   │   ├── f7_voice_vision_stress.test.ts# Mic denied error, PNG magic bytes, virtual screen (5 tests)
│   │   ├── f8_lyrics_anomalies.test.ts   # Corrupt timestamps skipped, unsorted LRC, 2hr+ (5 tests)
│   │   ├── f9_physics_extremes.test.ts   # dt=0.1s/0.001s stability, offscreen gaze, zeta feel (5 tests)
│   │   └── f10_legacy_traps.test.ts      # Zero electron imports in frontend, 0 port collision (5 tests)
│   ├── tier3_combinations/
│   │   └── pairwise.test.ts       # 12 cross-feature pairwise interaction test cases (12 tests)
│   ├── tier4_scenarios/
│   │   └── workflows.test.ts      # 6 real-world end-to-end user workflows (6 tests)
│   └── runner.ts                  # Executable CLI runner reporting executive summaries
```

---

## Instructions for Milestone Implementers (M1–M4)

Milestone implementers can run the test suite at any point during development:

1. **Continuous Verification**:
   Run `deno run -A --config tests/deno.json tests/e2e/runner.ts` before committing changes to ensure no contract regressions.
2. **Feature-Specific Verification**:
   When implementing a specific feature (e.g. M2 CoreAudio in `src-tauri/src/audio.rs`), run the targeted tests:
   ```powershell
   deno test --config tests/deno.json -A tests/e2e/tier1_features/f4_coreaudio.test.ts tests/e2e/tier2_boundaries/f4_rapid_audio_spikes.test.ts
   ```
3. **No Modification Policy**:
   Tests are opaque-box requirement specifications. Implementers must adjust implementation code to satisfy the tests, not modify test files to match broken behavior.
