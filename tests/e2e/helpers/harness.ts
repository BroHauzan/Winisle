/**
 * Test harness, physics models, hit-testing simulators, and IPC mocks
 * derived directly from PROJECT.md, IslandSurface.tsx, and cursor.rs.
 */

import { IslandRect, VolumePayload, SpringState } from './types.ts';

export const WINISLE_CONTEXT_GUID = '11111111-2222-3333-4444-555555555555';

/**
 * Spring physics simulation matching IslandSurface.tsx (lines 11-21)
 */
export function stepSpring(s: SpringState, dt: number): boolean {
  const force = (s.target - s.value) * s.stiffness - s.velocity * s.damping;
  s.velocity += force * dt;
  s.value += s.velocity * dt;
  if (Math.abs(s.target - s.value) < 0.2 && Math.abs(s.velocity) < 1.0) {
    s.value = s.target;
    s.velocity = 0;
    return true; // Settled
  }
  return false;
}

/**
 * Hit-testing coordinator matching cursor.rs / overlay.rs logic
 * Bounds include safety shoulder margins: [-4 left, +4 right, -2 top, +6 bottom]
 */
export function isPointInsideIslandHitbox(
  x: number,
  y: number,
  bounds: IslandRect,
  margins = { left: 4, right: 4, top: 2, bottom: 6 }
): boolean {
  return (
    x >= bounds.left - margins.left &&
    x <= bounds.right + margins.right &&
    y >= bounds.top - margins.top &&
    y <= bounds.bottom + margins.bottom
  );
}

/**
 * Simulated Tauri IPC Event Bus with latency tracking
 */
export class MockTauriIpcBus {
  private listeners: Map<string, Array<(payload: any) => void>> = new Map();
  public emittedEvents: Array<{ event: string; payload: any; timestamp: number }> = [];

  listen(event: string, handler: (payload: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
    return () => {
      const list = this.listeners.get(event) || [];
      const idx = list.indexOf(handler);
      if (idx !== -1) list.splice(idx, 1);
    };
  }

  emit(event: string, payload: any): void {
    const timestamp = performance.now();
    this.emittedEvents.push({ event, payload, timestamp });
    const handlers = this.listeners.get(event) || [];
    for (const h of handlers) {
      h(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
    this.emittedEvents = [];
  }
}

/**
 * In-memory Mock Tauri Backend Controller
 */
export class MockTauriBackend {
  public bus = new MockTauriIpcBus();
  public masterVolume = 50;
  public masterMute = false;
  public displayBrightness = 70;
  public clickThroughIgnored = true;
  public interactiveLocked = false;
  public islandBounds: IslandRect = { left: 590, top: 0, right: 710, bottom: 34 };
  public invocationLog: Array<{ command: string; args: any }> = [];

  // Tauri Commands
  set_volume(volume: number, callerGuid?: string): { success: boolean } {
    const clamped = Math.max(0, Math.min(100, Math.round(volume)));
    this.masterVolume = clamped;
    this.invocationLog.push({ command: 'set_volume', args: { volume: clamped, callerGuid } });
    const is_self = callerGuid === WINISLE_CONTEXT_GUID;
    this.bus.emit('volume_changed', {
      volume: clamped,
      muted: this.masterMute,
      is_self,
    } as VolumePayload);
    return { success: true };
  }

  get_volume(): number {
    this.invocationLog.push({ command: 'get_volume', args: {} });
    return this.masterVolume;
  }

  set_mute(muted: boolean, callerGuid?: string): { success: boolean } {
    this.masterMute = Boolean(muted);
    this.invocationLog.push({ command: 'set_mute', args: { muted, callerGuid } });
    const is_self = callerGuid === WINISLE_CONTEXT_GUID;
    this.bus.emit('volume_changed', {
      volume: this.masterVolume,
      muted: this.masterMute,
      is_self,
    } as VolumePayload);
    return { success: true };
  }

  get_mute(): boolean {
    this.invocationLog.push({ command: 'get_mute', args: {} });
    return this.masterMute;
  }

  set_brightness(level: number): { success: boolean } {
    const clamped = Math.max(0, Math.min(100, Math.round(level)));
    this.displayBrightness = clamped;
    this.invocationLog.push({ command: 'set_brightness', args: { level: clamped } });
    this.bus.emit('brightness_changed', { brightness: clamped });
    return { success: true };
  }

  get_brightness(): number {
    this.invocationLog.push({ command: 'get_brightness', args: {} });
    return this.displayBrightness;
  }

  update_island_bounds(rect: IslandRect): { success: boolean } {
    this.islandBounds = { ...rect };
    this.invocationLog.push({ command: 'update_island_bounds', args: { rect } });
    return { success: true };
  }

  set_interactive_lock(locked: boolean): { success: boolean } {
    this.interactiveLocked = Boolean(locked);
    if (this.interactiveLocked) {
      this.clickThroughIgnored = false;
    }
    this.invocationLog.push({ command: 'set_interactive_lock', args: { locked } });
    return { success: true };
  }

  onCursorMove(x: number, y: number): boolean {
    if (this.interactiveLocked) {
      this.clickThroughIgnored = false;
      return false; // not ignoring
    }
    const inside = isPointInsideIslandHitbox(x, y, this.islandBounds);
    this.clickThroughIgnored = !inside;
    return this.clickThroughIgnored;
  }
}
