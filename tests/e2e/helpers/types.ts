/**
 * Interface contracts and schema types defined in PROJECT.md and TEST_INFRA.md.
 */

export interface IslandRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface VolumePayload {
  volume: number; // 0..100
  muted: boolean;
  is_self: boolean;
}

export interface BrightnessPayload {
  brightness: number; // 0..100
}

export interface BatteryInfo {
  percentage: number; // 0..100
  is_charging: boolean;
}

export interface HardwareStatus {
  volume: number;
  muted: boolean;
  brightness: number;
  battery: BatteryInfo | null;
}

export interface LyricWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface LyricLine {
  timeMs: number;
  text: string;
  words?: LyricWord[];
}

export interface SpringState {
  value: number;
  velocity: number;
  target: number;
  stiffness: number;
  damping: number;
}

export interface TauriWindowConfig {
  label?: string;
  title?: string;
  width: number;
  height: number;
  transparent: boolean;
  decorations: boolean;
  alwaysOnTop: boolean;
  skipTaskbar: boolean;
  shadow: boolean;
  resizable: boolean;
  visible?: boolean;
}

export interface TauriAppConfig {
  productName: string;
  version: string;
  identifier: string;
  build: {
    frontendDist: string;
    devUrl?: string;
    beforeBuildCommand?: string;
  };
  app: {
    windows: TauriWindowConfig[];
    security?: {
      csp?: string;
    };
  };
}

export interface CargoReleaseProfile {
  optLevel: string;
  lto: boolean | string;
  codegenUnits: number;
  panic: string;
  strip: boolean | string;
}
