import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendFinalTranscript,
  processSpeechResults,
  mapBrowserSpeechError,
} from '../src/domain/voice.ts';
import { confirmCard, emptyWorkspace, isDecision, mergeSuggestions } from '../src/domain/logic.ts';
import { demoProvider } from '../src/providers/demoProvider.ts';

test('appendFinalTranscript: appends to empty and non-empty text cleanly', () => {
  const step1 = appendFinalTranscript('', 'First idea.');
  assert.equal(step1.text, 'First idea.');
  assert.equal(step1.nextCursor, 11);

  const step2 = appendFinalTranscript(step1.text, 'Second idea.');
  assert.equal(step2.text, 'First idea. Second idea.');
  assert.equal(step2.nextCursor, 24);
});

test('appendFinalTranscript: preserves manual typed edits and does not clobber user text', () => {
  // 1. Initial voice chunk
  const v1 = appendFinalTranscript('', 'I want voice input');
  assert.equal(v1.text, 'I want voice input');

  // 2. User manually types an edit in the middle or end
  const userEdited = v1.text + ' right now!';

  // 3. Late voice chunk arrives
  const v2 = appendFinalTranscript(userEdited, 'and it should keep control');
  assert.equal(v2.text, 'I want voice input right now! and it should keep control');
});

test('appendFinalTranscript: inserts at cursor position without destroying rest of text', () => {
  const initial = 'Hello world!';
  // Cursor after 'Hello' (index 5)
  const result = appendFinalTranscript(initial, 'brave new', 5);
  assert.equal(result.text, 'Hello brave new world!');
  assert.equal(result.nextCursor, 15);
});

test('processSpeechResults: prevents duplicate finalized chunks', () => {
  let lastIndex = -1;

  // First speech event with final index 0
  const event1 = [
    { index: 0, transcript: 'Hello world', isFinal: true },
  ];
  const r1 = processSpeechResults(event1, lastIndex);
  assert.deepEqual(r1.newFinalChunks, ['Hello world']);
  assert.equal(r1.nextLastFinalIndex, 0);
  lastIndex = r1.nextLastFinalIndex;

  // Duplicate event re-sending index 0
  const event2 = [
    { index: 0, transcript: 'Hello world', isFinal: true },
  ];
  const r2 = processSpeechResults(event2, lastIndex);
  assert.deepEqual(r2.newFinalChunks, []); // No duplicates!
  assert.equal(r2.nextLastFinalIndex, 0);

  // New speech event with final index 1 and interim index 2
  const event3 = [
    { index: 1, transcript: 'this is live voice', isFinal: true },
    { index: 2, transcript: 'speaking more', isFinal: false },
  ];
  const r3 = processSpeechResults(event3, lastIndex);
  assert.deepEqual(r3.newFinalChunks, ['this is live voice']);
  assert.equal(r3.interimText, 'speaking more');
  assert.equal(r3.nextLastFinalIndex, 1);
});

test('mapBrowserSpeechError: provides clear explanations for permission denial and errors', () => {
  const denied = mapBrowserSpeechError('not-allowed');
  assert.equal(denied.type, 'permission_denied');
  assert.match(denied.message, /permission was denied/i);

  const capture = mapBrowserSpeechError('audio-capture');
  assert.equal(capture.type, 'permission_denied');
  assert.match(capture.message, /microphone was found/i);

  const network = mapBrowserSpeechError('network');
  assert.equal(network.type, 'network');

  const noSpeech = mapBrowserSpeechError('no-speech');
  assert.equal(noSpeech.type, 'no_speech');
});

test('voice-derived cards remain unconfirmed until explicit user approval', () => {
  const voiceText = 'I want to speak freely. Maybe it can auto tag.';
  let ws = { ...emptyWorkspace(), sourceText: voiceText, sourceRevision: 1 };
  
  // Suggest cards derived from the voice text
  const suggestions = demoProvider.extract(voiceText, 1, () => 'card-voice-1', '2026-01-01');
  ws = mergeSuggestions(ws, suggestions);

  // All voice-derived cards must be 'ai' origin and 'suggested' approval
  assert.ok(ws.cards.length > 0);
  for (const card of ws.cards) {
    assert.equal(card.origin, 'ai');
    assert.equal(card.approval, 'suggested');
    assert.equal(isDecision(card), false);
  }

  // Only becomes decision when user explicitly confirms
  ws = confirmCard(ws, 'card-voice-1', '2026-01-01');
  const confirmed = ws.cards.find(c => c.id === 'card-voice-1')!;
  assert.equal(confirmed.approval, 'confirmed');
  assert.equal(confirmed.origin, 'ai'); // Preserves AI origin
  assert.equal(isDecision(confirmed), true);
});
