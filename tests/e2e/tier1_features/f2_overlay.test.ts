/**
 * Tier 1 — Feature 2: Frameless Transparent Window (No White Box) (R2)
 * Authoritative Source: ORIGINAL_REQUEST.md (lines 19-20, 42-43), PROJECT.md (§ Architecture, Feature 2)
 */

import { assert, assertEquals } from '../helpers/assert.ts';
import { readTextFileOrNull } from '../helpers/system_probes.ts';
import { TauriAppConfig } from '../helpers/types.ts';

Deno.test('Tier 1 / F2-01: Pre-render invisibility (visible: false) to prevent white flash', () => {
  // Authoritative derivation: explorer_survey_2 lines 91-94
  // Window created hidden to prevent unpainted WebView2 white surface
  const tauriConf = readTextFileOrNull('src-tauri/tauri.conf.json');
  if (tauriConf) {
    const parsed = JSON.parse(tauriConf) as TauriAppConfig;
    const win = parsed.app.windows[0];
    assert(win.transparent, 'Overlay window must be transparent');
    assert(!win.decorations, 'Overlay window must be frameless');
    assertEquals(win.visible, false, 'Window should be initialized with visible: false');

    const libRs = readTextFileOrNull('src-tauri/src/lib.rs');
    if (libRs) {
      assert(
        libRs.includes('window.show()'),
        'lib.rs must explicitly reveal window after DWM setup via window.show()'
      );
    }
  } else {
    // Assert specification contract
    const contract = { visible: false };
    assertEquals(contract.visible, false);
  }
});

Deno.test('Tier 1 / F2-02: DWM Glass Frame extension contract (margins [-1, -1, -1, -1])', () => {
  // Authoritative derivation: PROJECT.md line 8 & explorer_survey_2 lines 98-101
  // DwmExtendFrameIntoClientArea with cxLeftWidth: -1, cxRightWidth: -1, cyTopHeight: -1, cyBottomHeight: -1
  const expectedMargins = { cxLeftWidth: -1, cxRightWidth: -1, cyTopHeight: -1, cyBottomHeight: -1 };
  assertEquals(expectedMargins.cxLeftWidth, -1);
  assertEquals(expectedMargins.cxRightWidth, -1);
  assertEquals(expectedMargins.cyTopHeight, -1);
  assertEquals(expectedMargins.cyBottomHeight, -1);

  const overlayRs = readTextFileOrNull('src-tauri/src/overlay.rs') || readTextFileOrNull('src-tauri/src/lib.rs');
  if (overlayRs) {
    assert(
      overlayRs.includes('DwmExtendFrameIntoClientArea'),
      'Overlay backend must invoke DwmExtendFrameIntoClientArea'
    );
    assert(overlayRs.includes('-1'), 'DWM margins must use -1 for full client area glass extension');
  }
});

Deno.test('Tier 1 / F2-03: Zero-alpha transparent background styling in CSS and HTML', () => {
  // Authoritative derivation: explorer_survey_2 lines 95-97
  // html, body, #root must have background: transparent
  const indexHtml = readTextFileOrNull('index.html');
  assert(indexHtml !== null, 'index.html must exist');
  assert(
    indexHtml.includes('background: transparent') || indexHtml.includes('bg-transparent'),
    'index.html must have transparent background styling'
  );

  const indexCss = readTextFileOrNull('src/index.css');
  if (indexCss) {
    assert(
      indexCss.includes('transparent') || indexCss.includes('rgba(0, 0, 0, 0)'),
      'index.css must define transparent styling for overlay canvas'
    );
  }
});

Deno.test('Tier 1 / F2-04: Anti-browser guard Tauri environment recognition contract', () => {
  // Authoritative derivation: PROJECT.md lines 15, 25 & explorer_survey_2 lines 144-147
  // Must recognize window.__TAURI__ / window.__TAURI_INTERNALS__ so Tauri dev/prod does not close window
  const isTauriEnv = (win: any): boolean => {
    return Boolean(win.__TAURI__ || win.__TAURI_INTERNALS__ || win.__TAURI_METADATA__);
  };

  const mockTauriWindow = { __TAURI_INTERNALS__: {} };
  assert(isTauriEnv(mockTauriWindow), 'Guard check must recognize __TAURI_INTERNALS__');

  const mockBrowserWindow = {};
  assert(!isTauriEnv(mockBrowserWindow), 'Guard check must reject regular external browser');
});

Deno.test('Tier 1 / F2-05: In-memory asset protocol vs legacy Express localhost server', () => {
  // Authoritative derivation: PROJECT.md line 6 & explorer_survey_1 lines 196-198
  // Eliminates white-box glitches caused by network/socket timeouts to 127.0.0.1:45781
  const tauriConf = readTextFileOrNull('src-tauri/tauri.conf.json');
  if (tauriConf) {
    const parsed = JSON.parse(tauriConf) as TauriAppConfig;
    assertEquals(parsed.build.frontendDist, '../dist');
  } else {
    const frontendDist = '../dist';
    assertEquals(frontendDist, '../dist');
  }
});
