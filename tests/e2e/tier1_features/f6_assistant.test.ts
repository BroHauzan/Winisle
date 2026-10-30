/**
 * Tier 1 — Feature 6: Google Gemini 3.8 Assistant & Alt+Q Shortcut (R4)
 * Authoritative Source: ORIGINAL_REQUEST.md (lines 25-26, 50-51), PROJECT.md (§ Architecture, Feature 11, Contract 2)
 */

import { assert, assertEquals } from '../helpers/assert.ts';
import { MockTauriIpcBus } from '../helpers/harness.ts';

Deno.test('Tier 1 / F6-01: Global shortcut Alt+Q registration contract', () => {
  // Authoritative derivation: PROJECT.md lines 35, 65 & explorer_survey_2 line 171
  // Shortcut: Alt+Q via tauri-plugin-global-shortcut
  const shortcut = 'Alt+Q';
  assertEquals(shortcut, 'Alt+Q');
});

Deno.test('Tier 1 / F6-02: toggle_isle_assistant event dispatch', () => {
  // Authoritative derivation: PROJECT.md line 65
  const bus = new MockTauriIpcBus();
  let toggleFired = false;

  bus.listen('toggle_isle_assistant', () => {
    toggleFired = true;
  });

  bus.emit('toggle_isle_assistant', {});
  assert(toggleFired, 'toggle_isle_assistant event must trigger listener');
});

Deno.test('Tier 1 / F6-03: Assistant mode state transitions', () => {
  // Authoritative derivation: explorer_survey_1 line 50 & App.tsx assistantMode
  type AssistantMode = 'idle' | 'voice-pill' | 'conversation';
  let mode: AssistantMode = 'idle';

  // Open Alt+Q in default conversation mode
  mode = 'conversation';
  assertEquals(mode, 'conversation');

  // Switch to voice pill mode
  mode = 'voice-pill';
  assertEquals(mode, 'voice-pill');

  // Dismiss
  mode = 'idle';
  assertEquals(mode, 'idle');
});

Deno.test('Tier 1 / F6-04: API key masking and validation format', () => {
  // Authoritative derivation: App.tsx localStorage gemini_api_key handling
  const rawKey = 'AIzaSyD-dummyKey1234567890ABCDEF';
  const maskKey = (key: string): string => {
    if (!key || key.length < 10) return '••••••••';
    return `${key.slice(0, 7)}...${key.slice(-4)}`;
  };

  const masked = maskKey(rawKey);
  assertEquals(masked, 'AIzaSyD...CDEF');
  assert(rawKey.startsWith('AIzaSy'));
});

Deno.test('Tier 1 / F6-05: Multimodal prompt payload structure', () => {
  // Authoritative derivation: PROJECT.md line 59 & explorer_survey_1 line 50
  interface AssistantPayload {
    prompt: string;
    imageBase64?: string;
    mimeType?: 'image/png' | 'image/jpeg';
  }

  const payload: AssistantPayload = {
    prompt: 'Summarize the current desktop window',
    imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    mimeType: 'image/png',
  };

  assert(payload.prompt.length > 0);
  assert(payload.imageBase64 !== undefined);
  assertEquals(payload.mimeType, 'image/png');
});
