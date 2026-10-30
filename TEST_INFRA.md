# E2E Test Infra: WinIsle Tauri 2.0 Migration

## Test Philosophy
- Opaque-box, requirement-driven. Derived from `ORIGINAL_REQUEST.md` and user requirements, independent of internal implementation details.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.

## Feature Inventory Mapping
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|---------------------|:------:|:------:|:------:|:------:|
| 1 | Tauri 2.0 Architecture & 5-10MB Size | R1 | 5 | 5 | ✓ | ✓ |
| 2 | Frameless Transparent Overlay (No White Box) | R2 | 5 | 5 | ✓ | ✓ |
| 3 | Click-Through & Dynamic Hit-Testing | R2 | 5 | 5 | ✓ | ✓ |
| 4 | Instant Windows CoreAudio Volume Listener | R3 | 5 | 5 | ✓ | ✓ |
| 5 | Bi-Directional Volume, Mute & Brightness Controls | R3 | 5 | 5 | ✓ | ✓ |
| 6 | Google Gemini 3.8 Assistant & Alt+Q Shortcut | R4 | 5 | 5 | ✓ | ✓ |
| 7 | Multimodal Live Voice & Screenshot Vision | R4 | 5 | 5 | ✓ | ✓ |
| 8 | Synced Lyrics (LRCLIB) & 4-Bar Equalizer | R4 | 5 | 5 | ✓ | ✓ |
| 9 | BotCanvas Character & Spring Physics | R4 | 5 | 5 | ✓ | ✓ |
| 10 | Legacy Electron & Server Cleanup Verification | R1, Cleanup | 5 | 5 | ✓ | ✓ |

## Test Architecture
- **Test Runner**: Node / Deno test harness (`tests/e2e/runner.ts` or `tests/e2e/test_suite.ts`).
- **Binary & Packaging Verifier**: Powershell/Node script checking compiled binary size, release symbols, and executable headers.
- **Window Presentation Verifier**: Checks transparent window styling, DWM glass extension, and frameless parameters in build configuration and runtime properties.
- **Audio & Hardware Verifier**: Automated verification script testing CoreAudio volume change emission, latency under rapid bursts (100 rapid events), and mute/brightness round-trips.
- **Feature Parity Verifier**: Verifies frontend builds cleanly without missing modules, Gemini assistant hooks, lyrics parser, BotCanvas assets, and shortcuts.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Cold Start to Transparent Idle Overlay | F1, F2, F3, F9 | High |
| 2 | Rapid Hardware Volume Burst During Media Playback | F4, F5, F8 | High |
| 3 | Isle Assistant Alt+Q Invocation & Multimodal Query | F6, F7, F3 | High |
| 4 | Desktop Brightness & Battery Status Monitoring | F5, F3 | Medium |
| 5 | Full Workspace Hygiene & Zero Electron Residue Verification | F1, F10 | Medium |

## Coverage Thresholds
- N = 10 Feature Categories:
- Tier 1 (Feature Coverage): ≥ 50 test cases (≥5 per feature category)
- Tier 2 (Boundary & Corner Cases): ≥ 50 test cases (rapid volume spikes, extreme bounds, audio device detach, fullscreen transition)
- Tier 3 (Cross-Feature Combinations): ≥ 10 pairwise test cases
- Tier 4 (Real-World Scenarios): ≥ 5 realistic application workflows
- **Total Target**: ≥ 115 test cases
