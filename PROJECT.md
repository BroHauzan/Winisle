# Project: WinIsle Tauri 2.0 Migration

## Architecture
- **Overview**: Migration of WinIsle from Electron (Chromium + Node.js Express + C# helper) to Tauri 2.0 (Rust native backend + WebView2 React frontend) targeting ~5–10 MB standalone executable footprint, 0 ms latency hardware audio response, transparent overlay with zero white-box/border artifacts, and 100% feature parity for AI, media, and productivity applets.
- **Backend Architecture (`src-tauri`)**:
  - `tauri.conf.json`: Frameless, transparent, always-on-top, skipTaskbar, shadowless 740x340 window overlay centered horizontally at top of screen (`top: 0`). Configured for local in-memory asset loading (`tauri://localhost`).
  - `Cargo.toml`: Release profile optimizations (`opt-level = "z"`, `lto = true`, `codegen-units = 1`, `panic = "abort"`, `strip = true`). Windows crate dependencies for COM, CoreAudio, GDI, WMI, Power, and DWM.
  - `main.rs` / `lib.rs`: Tauri builder, command registration, DWM glass frame extension (`DwmExtendFrameIntoClientArea` with margins `[-1, -1, -1, -1]`), and application lifecycle.
  - `audio.rs`: In-process Windows CoreAudio `IAudioEndpointVolumeCallback` and `IMMNotificationClient` streaming `volume_changed` events via `app_handle.emit` directly to WebView2 with zero IPC latency. Rebinds safely on default audio device changes. Filters self-initiated volume events via `WINISLE_CONTEXT_GUID`.
  - `hardware.rs`: Dual-engine brightness control (WMI ACPI for internal laptop displays with fallback to DXVA2 DDC/CI for external desktop monitors) and native battery status via Win32 `GetSystemPowerStatus`.
  - `cursor.rs`: Native Win32 `GetCursorPos` monitor coordinating `window.set_ignore_cursor_events` around the Dynamic Island notch bounding rect, overcoming the Win32 `WS_EX_TRANSPARENT` event trap.
  - `tray.rs`: Native system tray menu with island toggle, assistant toggle, and application exit.
- **Frontend Architecture (`src/`)**:
  - React 19 + TypeScript + Vite 8.
  - Remove/adapt anti-browser guards in `index.html` and `src/main.tsx` to recognize Tauri (`window.__TAURI_INTERNALS__`).
  - Unified Tauri bridge replacing `window.electronAPI` and Express HTTP/SSE endpoints with Tauri `invoke()` commands and `listen()` event streams.
  - Full preservation of Dynamic Island spring physics (`IslandSurface.tsx`), System Alert HUDs, BotCanvas procedural face, Gemini 3.8 Multimodal Assistant (Live Voice WebSocket streaming & conversation chat), Synced Lyrics (LRCLIB & GSMTC), and productivity tools (Pomodoro, ToDo, File shelf, Calendar).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Tauri 2.0 Project Scaffold & 5-10MB Profile | Native Rust backend with Cargo profile optimizations (opt-level 'z', LTO, strip) | M1 | survey |
| 2 | Frameless Transparent Window | Zero white box / border artifacts via DWM glass extension, 740x340 overlay | M1 | survey |
| 3 | Dynamic Click-Through Hit-Testing | Win32 GetCursorPos monitor coordinating set_ignore_cursor_events for notch | M1 | survey |
| 4 | Frontend Anti-Browser Guard Migration | Adapt index.html and main.tsx to recognize window.__TAURI_INTERNALS__ | M1 | survey |
| 5 | Native CoreAudio Volume Listener | Zero-lag IAudioEndpointVolumeCallback streaming volume_changed events | M2 | survey |
| 6 | Native Audio Endpoint Rebind | IMMNotificationClient re-binding on default playback device changes | M2 | survey |
| 7 | Bi-directional Volume & Mute Commands | Native get_volume, set_volume, set_mute commands with WINISLE_CONTEXT_GUID | M2 | survey |
| 8 | Bi-directional Brightness Control | Dual-engine WMI ACPI + DXVA2 DDC/CI monitor brightness get/set | M2 | survey |
| 9 | Battery & Power Status | Native Win32 GetSystemPowerStatus battery percentage & AC state | M2 | survey |
| 10 | Frontend Bridge & Hardware HUD Integration | Connect App.tsx and IslandSurface.tsx to Tauri hardware events & commands | M2 | survey |
| 11 | Gemini Multimodal Assistant & Voice | Alt+Q shortcut, conversation mode, screenshot capture, and Live Voice WebSockets | M3 | survey |
| 12 | Synced Lyrics & Media Center | LRCLIB synchronization, 4-bar equalizer, and media playback controls | M3 | survey |
| 13 | BotCanvas & Island Applets | Procedural canvas face, Pomodoro, ToDo, File shelf, Calendar, Alarms | M3 | survey |
| 14 | System Tray & Hotkeys | Native system tray menu and global keyboard shortcuts | M3 | survey |
| 15 | E2E Verification & Tier 1-4 Test Suite | Comprehensive opaque-box and hardware simulation verification suite | M4 | survey |
| 16 | Legacy Electron Cleanup | Complete removal of electron/, server.ts, dist-server/, and Electron configs | M4 | survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Tauri 2.0 Base & Frameless Transparent Window | Rust scaffold (`src-tauri`), `tauri.conf.json`, DWM transparency, click-through cursor monitor, browser-guard adaptation | none | DONE |
| M2 | Native CoreAudio & Hardware Event Stream | CoreAudio COM listener, endpoint rebind, volume/mute/brightness commands, frontend bridge | M1 | DONE |
| M3 | AI & Media Feature Parity Integration | Gemini multimodal assistant, Live Voice, synced lyrics, BotCanvas, tray, and applets | M2 | DONE |
| M4 | E2E Testing Verification & Legacy Electron Cleanup | Full test suite execution (Tiers 1-4), verification of acceptance criteria, legacy cleanup | M3 | DONE |

## Interface Contracts

### 1. Tauri Commands (Rust -> Frontend)
- `set_volume(volume: u32) -> Result<(), String>`: Sets master volume scalar (0-100). Uses `WINISLE_CONTEXT_GUID` so event callback marks `is_self: true`.
- `get_volume() -> Result<u32, String>`: Returns current master volume scalar (0-100).
- `set_mute(muted: bool) -> Result<(), String>`: Toggles master mute state.
- `get_mute() -> Result<bool, String>`: Returns current master mute state.
- `set_brightness(brightness: u32) -> Result<(), String>`: Adjusts display brightness (0-100) via WMI ACPI or DXVA2 DDC/CI.
- `get_brightness() -> Result<u32, String>`: Returns current display brightness (0-100).
- `get_battery_status() -> Result<BatteryInfo, String>`: Returns `{ percentage: u32, is_charging: bool }`.
- `update_island_bounds(rect: IslandRect) -> Result<(), String>`: Informs Rust cursor monitor of current interactive notch bounding box `(x, y, width, height)`.
- `set_interactive_lock(locked: bool) -> Result<(), String>`: Disables click-through when Isle Assistant or modal is open.
- `get_system_screenshot() -> Result<String, String>`: Captures primary screen and returns base64 PNG for Gemini multimodal vision.

### 2. Tauri Events (Rust -> Frontend)
- `volume_changed`: Payload `{ volume: u32, muted: bool, is_self: bool }`. Dispatched instantaneously from CoreAudio `IAudioEndpointVolumeCallback`.
- `brightness_changed`: Payload `{ brightness: u32 }`.
- `power_changed`: Payload `{ percentage: u32, is_charging: bool }`.
- `toggle_isle_assistant`: Dispatched on `Alt+Q` global shortcut or system tray click.

### 3. Frontend Global Bridge (`src/core/tauri-bridge.ts`)
- Replaces `window.electronAPI`:
  - `setIgnoreMouseEvents(ignore: boolean)` -> calls `set_interactive_lock(!ignore)` / updates island bounds.
  - `getHardwareStatus()` -> invokes `get_volume`, `get_mute`, `get_brightness`, `get_battery_status`.
  - `onToggleAssistant(callback)` -> listens to `toggle_isle_assistant`.

## Code Layout
- `src-tauri/`
  - `Cargo.toml`: Tauri 2.0 dependencies, Windows crate features, and release optimization profile.
  - `tauri.conf.json`: Application metadata, window configuration (740x340, frameless, transparent, alwaysOnTop).
  - `build.rs`: Tauri build hook.
  - `src/`
    - `main.rs`: Application entry point.
    - `lib.rs`: Tauri builder, commands registration, window initialization with DWM glass frame.
    - `audio.rs`: CoreAudio COM callback and endpoint listener.
    - `hardware.rs`: WMI / DXVA2 brightness and Win32 battery.
    - `cursor.rs`: Win32 GetCursorPos adaptive click-through monitor.
    - `tray.rs`: System tray menu setup and handlers.
- `src/`
  - `main.tsx`: Entry point with updated browser/Tauri environment guard.
  - `App.tsx`: Main UI coordinating island states, assistant, media, and hardware listeners.
  - `core/`
    - `tauri-bridge.ts`: Unified abstraction for Tauri commands and events.
    - `gemini.ts`: Multimodal assistant client (text, vision, audio).
    - `gemini-live.ts`: Real-time Live Voice WebSocket streaming engine.
    - `lrc.ts`: Synced lyrics parser and interpolation engine.
  - `components/`: IslandSurface, BotCanvas, BeatEqualizerBars, IsleIcons, etc.
- `tests/e2e/`: E2E test suite (Tiers 1-4) verifying transparent overlay, CoreAudio events, hardware controls, and AI integrations.
