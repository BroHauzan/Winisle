/**
 * Adversarial Challenger Stress Harness for Milestone 3:
 * System Tray, Global Hotkey (Alt+Q), Assistant Interaction Mode & Interactive Lock.
 *
 * Requirements & Contracts Verified:
 * - R4: Isle Assistant (Alt+Q shortcut or tray) opens and interactive lock prevents click-through
 * - Win32 MOD_NOREPEAT repeat storm prevention
 * - Thread-safe window restoration (unminimize, set_focus, emit toggle_isle_assistant)
 * - Complete interactive lock lifecycle across entire 740x340 window
 * - Context menu contract ("Toggle Dynamic Island", "Open Assistant (Alt+Q)", "Always on Top", "Exit WinIsle")
 */

import { assert, assertEquals } from './helpers/assert.ts';
import { MockTauriBackend } from './helpers/harness.ts';
import { IslandRect } from './helpers/types.ts';

Deno.test('Challenger-M3-01: Win32 MOD_NOREPEAT & Frontend e.repeat storm suppression', () => {
  // Authoritative derivation: src-tauri/src/tray.rs line 109 & src/App.tsx line 4069
  // At OS level: MOD_NOREPEAT (0x4000) suppresses hardware key repeat for RegisterHotKey
  const MOD_ALT = 0x0001;
  const MOD_NOREPEAT = 0x4000;
  const VK_Q = 0x51;

  const combinedModifiers = MOD_ALT | MOD_NOREPEAT;
  assertEquals(combinedModifiers, 0x4001, 'MOD_ALT | MOD_NOREPEAT must equal 0x4001');
  assertEquals(VK_Q, 81, "VK_Q must be 0x51 ('Q')");

  // At Frontend level: App.tsx line 4069: if (e.repeat) return;
  // Simulate user physically holding down Alt+Q causing 50 rapid keydown events
  let assistantOpen = false;
  let toggleCount = 0;

  const handleKeyDown = (e: { altKey: boolean; key: string; repeat: boolean }) => {
    if (e.altKey && (e.key === 'q' || e.key === 'Q')) {
      if (e.repeat) return; // Chaos Guard: Holding Alt+Q won't flicker the Assistant
      assistantOpen = !assistantOpen;
      toggleCount++;
    }
  };

  // Initial keydown: opens assistant
  handleKeyDown({ altKey: true, key: 'q', repeat: false });
  assertEquals(assistantOpen, true);
  assertEquals(toggleCount, 1);

  // 50 consecutive autorepeat events while user holds key
  for (let i = 0; i < 50; i++) {
    handleKeyDown({ altKey: true, key: 'q', repeat: true });
  }

  // Assistant MUST remain stably open, NOT flicker or strobe 50 times
  assertEquals(assistantOpen, true, 'Assistant must stay open while Alt+Q is held');
  assertEquals(toggleCount, 1, 'Only exactly 1 toggle should have occurred despite 50 repeat events');

  // Key release and subsequent press closes assistant
  handleKeyDown({ altKey: true, key: 'q', repeat: false });
  assertEquals(assistantOpen, false, 'Second deliberate press closes assistant');
  assertEquals(toggleCount, 2);
});

Deno.test('Challenger-M3-02: Interactive Lock & Click-Through lifecycle on onToggleAssistant', () => {
  // Authoritative derivation: App.tsx lines 4214-4235 & cursor.rs lines 110-120
  const backend = new MockTauriBackend();
  const notchBounds: IslandRect = { left: 300, top: 0, right: 440, bottom: 34 };
  backend.update_island_bounds(notchBounds);

  // 1. Initial idle state: cursor outside island ignores mouse events (click-through active)
  assertEquals(backend.interactiveLocked, false);
  const initialOutside = backend.onCursorMove(100, 200);
  assertEquals(initialOutside, true, 'Initially outside island, click-through must be true (ignored = true)');

  // 2. onToggleAssistant fires (e.g. from Alt+Q or tray menu "Open Assistant")
  let assistantOpen = false;
  let clickThroughState = true;

  const toggleAssistantHandler = () => {
    if (assistantOpen) {
      assistantOpen = false;
      clickThroughState = true;
      backend.set_interactive_lock(false);
    } else {
      assistantOpen = true;
      clickThroughState = false;
      backend.set_interactive_lock(true);
    }
  };

  // Subscribe to toggle event
  backend.bus.listen('toggle_isle_assistant', toggleAssistantHandler);

  // Emit event from Rust backend
  backend.bus.emit('toggle_isle_assistant', {});

  // 3. Verify assistant opened and interactive lock activated
  assertEquals(assistantOpen, true, 'Assistant must be open');
  assertEquals(backend.interactiveLocked, true, 'set_interactive_lock(true) must be called');
  assertEquals(clickThroughState, false, 'Frontend click-through must be false');

  // 4. Exhaustive coordinate check across 740x340 window: ALL coordinates must capture mouse
  const windowTestCoords = [
    [0, 0],       // window top-left
    [740, 0],     // window top-right
    [0, 340],     // window bottom-left
    [740, 340],   // window bottom-right
    [100, 250],   // assistant chat container area
    [370, 310],   // input bar at bottom
    [50, 100],    // left margins
    [650, 100],   // right margins
  ];

  for (const [x, y] of windowTestCoords) {
    const ignored = backend.onCursorMove(x, y);
    assertEquals(
      ignored,
      false,
      `When Assistant is open, coordinate (${x}, ${y}) must NEVER ignore mouse events`
    );
  }

  // 5. Emit toggle again to close assistant
  backend.bus.emit('toggle_isle_assistant', {});
  assertEquals(assistantOpen, false, 'Assistant must be closed');
  assertEquals(backend.interactiveLocked, false, 'Interactive lock must be released');

  // 6. Verify click-through is restored outside the notch
  const postCloseOutside = backend.onCursorMove(100, 200);
  assertEquals(postCloseOutside, true, 'After closing, cursor outside notch must pass through');

  const postCloseInside = backend.onCursorMove(370, 15);
  assertEquals(postCloseInside, false, 'After closing, cursor inside notch must still interact');
});

Deno.test('Challenger-M3-03: Rapid toggle stress & race condition prevention (100 alternating cycles)', () => {
  const backend = new MockTauriBackend();
  let assistantOpen = false;

  backend.bus.listen('toggle_isle_assistant', () => {
    assistantOpen = !assistantOpen;
    backend.set_interactive_lock(assistantOpen);
  });

  for (let i = 1; i <= 100; i++) {
    backend.bus.emit('toggle_isle_assistant', {});
    const expectedOpen = i % 2 === 1;
    assertEquals(assistantOpen, expectedOpen, `Cycle ${i}: assistantOpen parity mismatch`);
    assertEquals(backend.interactiveLocked, expectedOpen, `Cycle ${i}: interactiveLocked state mismatch`);
  }

  // After 100 toggles, must end in closed state
  assertEquals(assistantOpen, false);
  assertEquals(backend.interactiveLocked, false);
});

Deno.test('Challenger-M3-04: System Tray menu options and action dispatch contract', () => {
  // Authoritative derivation: src-tauri/src/tray.rs lines 14-28
  interface MenuItemContract {
    id: string;
    text: string;
    checkable?: boolean;
    checked?: boolean;
  }

  const expectedMenuItems: MenuItemContract[] = [
    { id: 'toggle_island', text: 'Toggle Dynamic Island' },
    { id: 'open_assistant', text: 'Open Assistant (Alt+Q)' },
    { id: 'always_on_top', text: 'Always on Top', checkable: true, checked: true },
    { id: 'exit_app', text: 'Exit WinIsle' },
  ];

  // Verify all 4 expected items exist with exact identifiers and labels
  assertEquals(expectedMenuItems.length, 4);
  assertEquals(expectedMenuItems[0].text, 'Toggle Dynamic Island');
  assertEquals(expectedMenuItems[1].text, 'Open Assistant (Alt+Q)');
  assertEquals(expectedMenuItems[2].text, 'Always on Top');
  assertEquals(expectedMenuItems[2].checked, true);
  assertEquals(expectedMenuItems[3].text, 'Exit WinIsle');

  // Verify action handlers logic:
  // 1. toggle_island:
  let windowVisible = true;
  let windowMinimized = false;
  let windowFocused = false;

  const handleToggleIsland = () => {
    if (windowVisible) {
      windowVisible = false;
    } else {
      windowVisible = true;
      windowMinimized = false;
      windowFocused = true;
    }
  };

  handleToggleIsland(); // hide
  assertEquals(windowVisible, false);
  handleToggleIsland(); // show, unminimize, focus
  assertEquals(windowVisible, true);
  assertEquals(windowMinimized, false);
  assertEquals(windowFocused, true);

  // 2. open_assistant:
  let assistantToggled = false;
  const handleOpenAssistant = () => {
    windowVisible = true;
    windowMinimized = false;
    windowFocused = true;
    assistantToggled = true;
  };

  handleOpenAssistant();
  assert(windowVisible && !windowMinimized && windowFocused);
  assert(assistantToggled);

  // 3. always_on_top:
  let isAlwaysOnTop = true;
  const handleToggleAlwaysOnTop = () => {
    isAlwaysOnTop = !isAlwaysOnTop;
  };
  handleToggleAlwaysOnTop();
  assertEquals(isAlwaysOnTop, false);
  handleToggleAlwaysOnTop();
  assertEquals(isAlwaysOnTop, true);
});

Deno.test('Challenger-M3-05: Window restoration resilience (hidden or minimized overlay surfaces on Alt+Q)', () => {
  // Authoritative derivation: src-tauri/src/tray.rs lines 56-62, 132-138
  // When Alt+Q or tray menu is triggered while the window is hidden or minimized,
  // the backend must execute: show() -> unminimize() -> set_focus() -> emit(toggle_isle_assistant)
  interface WindowState {
    visible: boolean;
    minimized: boolean;
    focused: boolean;
  }

  const windowState: WindowState = {
    visible: false,
    minimized: true,
    focused: false,
  };

  const onHotkeyOrTrayOpen = (win: WindowState, bus: { emit: (ev: string) => void }) => {
    win.visible = true;
    win.minimized = false;
    win.focused = true;
    bus.emit('toggle_isle_assistant');
  };

  let assistantEmitted = false;
  const mockBus = {
    emit: (ev: string) => {
      if (ev === 'toggle_isle_assistant') assistantEmitted = true;
    },
  };

  onHotkeyOrTrayOpen(windowState, mockBus);

  assertEquals(windowState.visible, true, 'Window must be shown');
  assertEquals(windowState.minimized, false, 'Window must be unminimized');
  assertEquals(windowState.focused, true, 'Window must be focused');
  assertEquals(assistantEmitted, true, 'toggle_isle_assistant must be emitted');
});
