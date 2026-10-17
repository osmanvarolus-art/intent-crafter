import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFinalTranscript } from '../src/domain/voice.ts';
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
