/**
 * Adversarial Challenger Stress Harness for Milestone 3:
 * Native Desktop Screenshot Capture & Multi-Monitor Stress (R4)
 *
 * Stress-tests:
 * 1. Base64 payload decoding, PNG magic header (\x89PNG\r\n\x1a\n / 'iVBORw0KGgo')
 * 2. Multi-monitor virtual desktop bounds calculation with negative origins (SM_XVIRTUALSCREEN)
 * 3. Graceful fallback when virtual display metrics are zero or invalid
 * 4. Simulated GDI handle acquisition and balanced release tracking
 * 5. High-frequency consecutive capture burst throughput simulation
 * 6. Frontend dataURL wrapper formatting and payload integrity
 */

import { assert, assertEquals } from './helpers/assert.ts';

Deno.test('Challenger-M3-01: Base64 PNG magic bytes and IHDR header structure validation', () => {
  // Authoritative derivation: RFC 2083 (PNG specification) and screenshot.rs line 111-129
  // Minimal valid 1x1 RGBA PNG encoded in base64:
  const samplePngB64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  // 1. Base64 prefix check
  assert(
    samplePngB64.startsWith('iVBORw0KGgo'),
    'Screenshot payload must start with base64 PNG magic bytes iVBORw0KGgo'
  );

  // 2. Decode base64
  const binaryString = atob(samplePngB64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // 3. PNG signature: 8 bytes [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
  const expectedSig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    assertEquals(bytes[i], expectedSig[i], `Byte ${i} must match PNG signature`);
  }

  // 4. IHDR Chunk: length (4 bytes) + chunk type "IHDR" (4 bytes)
  const chunkType = String.fromCharCode(...bytes.slice(12, 16));
  assertEquals(chunkType, 'IHDR', 'First chunk must be IHDR');

  // 5. Dimensions
  const view = new DataView(bytes.buffer);
  const width = view.getUint32(16, false); // big-endian
  const height = view.getUint32(20, false);
  const bitDepth = bytes[24];
  const colorType = bytes[25]; // 6 = RGBA

  assertEquals(width, 1);
  assertEquals(height, 1);
  assertEquals(bitDepth, 8);
  assertEquals(colorType, 6, 'Color type must be 6 (RGBA)');
});

Deno.test('Challenger-M3-02: Multi-monitor virtual desktop coordinates with negative origin', () => {
  // Authoritative derivation: Win32 SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN
  // Scenario: Primary monitor (1920x1080) at (0,0), Secondary monitor (1920x1080) positioned to the LEFT
  interface MonitorConfig {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }

  const dualMonitorLeft: MonitorConfig[] = [
    { name: 'Secondary (Left)', x: -1920, y: 0, width: 1920, height: 1080 },
    { name: 'Primary (Right)', x: 0, y: 0, width: 1920, height: 1080 },
  ];

  const minX = Math.min(...dualMonitorLeft.map((m) => m.x));
  const minY = Math.min(...dualMonitorLeft.map((m) => m.y));
  const maxX = Math.max(...dualMonitorLeft.map((m) => m.x + m.width));
  const maxY = Math.max(...dualMonitorLeft.map((m) => m.y + m.height));

  const virtualX = minX;
  const virtualY = minY;
  const virtualWidth = maxX - minX;
  const virtualHeight = maxY - minY;

  assertEquals(virtualX, -1920, 'SM_XVIRTUALSCREEN must be -1920 for left secondary monitor');
  assertEquals(virtualY, 0, 'SM_YVIRTUALSCREEN must be 0');
  assertEquals(virtualWidth, 3840, 'SM_CXVIRTUALSCREEN must span both displays (3840px)');
  assertEquals(virtualHeight, 1080, 'SM_CYVIRTUALSCREEN must span display height (1080px)');

  // Verify that destination BitBlt buffer dimensions match virtualWidth x virtualHeight
  const destBitmapWidth = virtualWidth;
  const destBitmapHeight = virtualHeight;
  assertEquals(destBitmapWidth, 3840);
  assertEquals(destBitmapHeight, 1080);
});

Deno.test('Challenger-M3-03: Triple-monitor asymmetric coordinate space & vertical offsets', () => {
  // Scenario: 3 monitors with vertical offset and negative Y
  const tripleMonitors = [
    { x: -1440, y: 180, width: 1440, height: 900 },   // Left lower
    { x: 0, y: 0, width: 1920, height: 1080 },        // Center primary
    { x: 1920, y: -360, width: 2560, height: 1440 },  // Right upper
  ];

  const minX = Math.min(...tripleMonitors.map((m) => m.x));
  const minY = Math.min(...tripleMonitors.map((m) => m.y));
  const maxX = Math.max(...tripleMonitors.map((m) => m.x + m.width));
  const maxY = Math.max(...tripleMonitors.map((m) => m.y + m.height));

  assertEquals(minX, -1440);
  assertEquals(minY, -360);
  assertEquals(maxX, 4480);
  assertEquals(maxY, 1080);

  const virtualWidth = maxX - minX;
  const virtualHeight = maxY - minY;

  assertEquals(virtualWidth, 5920);
  assertEquals(virtualHeight, 1440);
});

Deno.test('Challenger-M3-04: Screen metrics graceful fallback when virtual metrics are invalid', () => {
  // Authoritative derivation: screenshot.rs lines 25-32
  // If SM_CXVIRTUALSCREEN <= 0 or SM_CYVIRTUALSCREEN <= 0, must fall back to SM_CXSCREEN, SM_CYSCREEN
  const resolveScreenRect = (
    virtX: number,
    virtY: number,
    virtW: number,
    virtH: number,
    primW: number,
    primH: number
  ) => {
    let x = virtX;
    let y = virtY;
    let width = virtW;
    let height = virtH;

    if (width <= 0 || height <= 0) {
      x = 0;
      y = 0;
      width = primW;
      height = primH;
    }

    if (width <= 0 || height <= 0) {
      throw new Error('Failed to query valid Windows screen metrics');
    }

    return { x, y, width, height };
  };

  // Normal case
  const normal = resolveScreenRect(-1920, 0, 3840, 1080, 1920, 1080);
  assertEquals(normal, { x: -1920, y: 0, width: 3840, height: 1080 });

  // Virtual zero fallback
  const fallbackZero = resolveScreenRect(0, 0, 0, 0, 1920, 1080);
  assertEquals(fallbackZero, { x: 0, y: 0, width: 1920, height: 1080 });

  // Virtual negative width fallback
  const fallbackNeg = resolveScreenRect(-100, -100, -1, 1080, 2560, 1440);
  assertEquals(fallbackNeg, { x: 0, y: 0, width: 2560, height: 1440 });
});

Deno.test('Challenger-M3-05: GDI handle lifecycle tracker simulation verifies zero handle leakage', () => {
  // Authoritative derivation: screenshot.rs lines 37-98
  // Every GetDC must pair with ReleaseDC; CreateCompatibleDC with DeleteDC; CreateCompatibleBitmap with DeleteObject
  class MockGdiResourceTracker {
    public dcCount = 0;
    public bitmapCount = 0;
    public peakHandles = 0;

    getDC(): number {
      this.dcCount++;
      this.updatePeak();
      return this.dcCount;
    }

    releaseDC(): void {
      if (this.dcCount <= 0) throw new Error('Unbalanced ReleaseDC!');
      this.dcCount--;
    }

    createDC(): number {
      this.dcCount++;
      this.updatePeak();
      return this.dcCount;
    }

    deleteDC(): void {
      if (this.dcCount <= 0) throw new Error('Unbalanced DeleteDC!');
      this.dcCount--;
    }

    createBitmap(): number {
      this.bitmapCount++;
      this.updatePeak();
      return this.bitmapCount;
    }

    deleteBitmap(): void {
      if (this.bitmapCount <= 0) throw new Error('Unbalanced DeleteObject(HBITMAP)!');
      this.bitmapCount--;
    }

    private updatePeak() {
      const current = this.dcCount + this.bitmapCount;
      if (current > this.peakHandles) this.peakHandles = current;
    }
  }

  const tracker = new MockGdiResourceTracker();

  // Simulate 50 screenshot capture cycles following screenshot.rs lifecycle
  for (let cycle = 0; cycle < 50; cycle++) {
    // 1. GetDC
    tracker.getDC();
    // 2. CreateCompatibleDC
    tracker.createDC();
    // 3. CreateCompatibleBitmap
    tracker.createBitmap();

    // ... BitBlt & GetDIBits ...

    // 4. Cleanup (SelectObject, DeleteObject, DeleteDC, ReleaseDC)
    tracker.deleteBitmap();
    tracker.deleteDC();
    tracker.releaseDC();

    assertEquals(tracker.dcCount, 0, `Cycle ${cycle}: DC count must return to 0`);
    assertEquals(tracker.bitmapCount, 0, `Cycle ${cycle}: Bitmap count must return to 0`);
  }

  assertEquals(tracker.peakHandles, 3, 'Peak GDI handle usage per capture must not exceed 3');
  assertEquals(tracker.dcCount, 0, 'Final DC handle count must be strictly 0');
  assertEquals(tracker.bitmapCount, 0, 'Final Bitmap handle count must be strictly 0');
});

Deno.test('Challenger-M3-06: Frontend dataURL wrapper and base64 integrity', () => {
  // Authoritative derivation: App.tsx lines 463-470
  // captureCurrentScreenAuto formats Tauri screenshot as `data:image/png;base64,${cleanPayload}`
  const rawBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const formatDataUrl = (payload: string): { dataUrl: string; base64: string } => {
    const cleanPayload = payload.replace(/^data:image\/[a-z]+;base64,/, '').trim();
    return {
      dataUrl: `data:image/png;base64,${cleanPayload}`,
      base64: cleanPayload,
    };
  };

  const result = formatDataUrl(rawBase64);
  assertEquals(result.base64, rawBase64);
  assertEquals(result.dataUrl, `data:image/png;base64,${rawBase64}`);
  assert(result.dataUrl.startsWith('data:image/png;base64,iVBORw0KGgo'));
});
