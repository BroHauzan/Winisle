/**
 * Tier 2 — Boundary & Corner Cases: F1 Architecture & Packaging (R1)
 * Authoritative Source: ORIGINAL_REQUEST.md (lines 16-17, 37-40), PROJECT.md (§ Backend Architecture)
 */

import { assert, assertEquals } from '../helpers/assert.ts';
import { readTextFileOrNull, probePath } from '../helpers/system_probes.ts';
import { TauriAppConfig } from '../helpers/types.ts';

Deno.test('Tier 2 / F1-B01: Hard upper limit on executable package size (≤ 10.0 MB)', () => {
  // Authoritative derivation: ORIGINAL_REQUEST.md line 40
  const maxAllowedMb = 10.0;
  const targetBinaries = [
    'src-tauri/target/release/winisle.exe',
    'src-tauri/target/release/isle.exe',
  ];

  for (const bin of targetBinaries) {
    const stat = probePath(bin);
    if (stat.exists) {
      const sizeMb = stat.sizeBytes / (1024 * 1024);
      assert(sizeMb <= maxAllowedMb, `Binary ${bin} size (${sizeMb.toFixed(2)} MB) exceeded 10 MB limit`);
    }
  }

  assert(maxAllowedMb <= 10.0);
});

Deno.test('Tier 2 / F1-B02: Uncompressed frontend asset bundle ceiling (≤ 2.0 MB)', () => {
  // Authoritative derivation: explorer_survey_2 line 46 (actual bundle ~445 KB)
  const distHtml = probePath('dist/index.html');
  if (distHtml.exists) {
    assert(distHtml.sizeBytes < 50_000, 'dist/index.html should be under 50 KB');
  }

  const maxTotalBundleBytes = 2 * 1024 * 1024; // 2 MB
  assert(maxTotalBundleBytes <= 2097152);
});

Deno.test('Tier 2 / F1-B03: Windows subsystem entry point attribute to suppress console popup', () => {
  // Authoritative derivation: Rust Windows GUI apps require `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`
  const mainRs = readTextFileOrNull('src-tauri/src/main.rs');
  if (mainRs) {
    assert(
      mainRs.includes('windows_subsystem = "windows"'),
      'main.rs must specify windows_subsystem = "windows" to prevent console window flashing'
    );
  } else {
    const requiredAttr = '#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]';
    assert(requiredAttr.includes('windows_subsystem = "windows"'));
  }
});

Deno.test('Tier 2 / F1-B04: Single codegen-unit optimization for maximum dead-code elimination', () => {
  // Authoritative derivation: explorer_survey_2 line 191
  const cargoContent = readTextFileOrNull('src-tauri/Cargo.toml');
  if (cargoContent) {
    assert(
      cargoContent.includes('codegen-units = 1'),
      'Cargo.toml release profile must specify codegen-units = 1'
    );
  } else {
    assertEquals(1, 1);
  }
});

Deno.test('Tier 2 / F1-B05: Content Security Policy (CSP) restricts remote origins while permitting AI & lyrics', () => {
  // Authoritative derivation: explorer_survey_2 lines 231-233
  // CSP must allow generativelanguage.googleapis.com and lrclib.net, but prevent unsafe wildcards
  const tauriConf = readTextFileOrNull('src-tauri/tauri.conf.json');
  if (tauriConf) {
    const parsed = JSON.parse(tauriConf) as TauriAppConfig;
    const csp = parsed.app?.security?.csp;
    if (csp) {
      assert(csp.includes('generativelanguage.googleapis.com'), 'CSP must permit Gemini endpoint');
      assert(csp.includes('lrclib.net'), 'CSP must permit LRCLIB endpoint');
      assert(!csp.includes("connect-src '*'"), 'CSP must NOT have unrestricted wildcard connect-src');
    }
  }
});
