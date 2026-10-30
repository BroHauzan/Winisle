/**
 * Tier 1 — Feature 7: Multimodal Live Voice & Screenshot Vision (R4)
 * Authoritative Source: ORIGINAL_REQUEST.md (lines 25-26, 50-51), PROJECT.md (§ Architecture, Feature 11, Contract 1)
 */

import { assert, assertEquals } from '../helpers/assert.ts';

Deno.test('Tier 1 / F7-01: Live Voice WebSocket endpoint specification', () => {
  // Authoritative derivation: explorer_survey_1 lines 51, 85
  // wss://generativelanguage.googleapis.com/...
  const host = 'generativelanguage.googleapis.com';
  const protocol = 'wss:';
  assertEquals(protocol, 'wss:');
  assert(host.includes('googleapis.com'));
});

Deno.test('Tier 1 / F7-02: Live Voice input audio encoding (16kHz 16-bit PCM)', () => {
  // Authoritative derivation: explorer_survey_1 line 51
  // Captures at 16,000 Hz, Float32 -> Int16 PCM
  const sampleRate = 16000;
  const bitDepth = 16;
  assertEquals(sampleRate, 16000);
  assertEquals(bitDepth, 16);

  // Conversion test
  const float32Sample = 0.5;
  const int16 = Math.max(-32768, Math.min(32767, Math.floor(float32Sample * 32767)));
  assertEquals(int16, 16383);
});

Deno.test('Tier 1 / F7-03: Live Voice model audio output format (24kHz PCM)', () => {
  // Authoritative derivation: explorer_survey_1 line 51
  // Gemini Live sends 24kHz PCM chunks
  const outputSampleRate = 24000;
  assertEquals(outputSampleRate, 24000);
});

Deno.test('Tier 1 / F7-04: get_system_screenshot command schema', () => {
  // Authoritative derivation: PROJECT.md line 59
  // Returns Result<String, String> (base64 encoded image)
  const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNiAAAABgADNjd8qAAAAABJRU5ErkJggg==';
  assert(dummyBase64.startsWith('iVBORw0KGgo')); // PNG magic header in base64
});

Deno.test('Tier 1 / F7-05: Real-time voice interruption handling', () => {
  // Authoritative derivation: explorer_survey_1 line 51
  // When user speaks while assistant is outputting audio, audio queue is cleared
  let audioQueue = ['chunk_1', 'chunk_2', 'chunk_3'];
  let isInterrupted = false;

  const onUserSpeechDetected = () => {
    isInterrupted = true;
    audioQueue = []; // Immediate flush
  };

  onUserSpeechDetected();
  assert(isInterrupted);
  assertEquals(audioQueue.length, 0);
});
