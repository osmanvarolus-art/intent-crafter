import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExtractPrompt, parseItems, runExtract } from '../server/extract.ts';
import { cardsFromItems, locate } from '../src/providers/modelProvider.ts';
import { classify } from '../src/providers/demoProvider.ts';
import { confirmCard, emptyWorkspace, mergeSuggestions, quoteIsValid } from '../src/domain/logic.ts';

const TEXT = 'Çeviri anlık olmalı ama internet yoksa da çalışabilir mi? Hangi formatta kaydetsin? TXT mi? MD mi?';

test('locate: exact quote, then the same words despite case and punctuation; never a guess', () => {
  assert.deepEqual(locate(TEXT, 'Çeviri anlık olmalı', 1), { revision: 1, start: 0, end: 19, quote: 'Çeviri anlık olmalı' });
  const loose = locate(TEXT, 'Hangi formatta kaydetsin, txt mi md mi', 1)!;
  assert.equal(loose.quote, 'Hangi formatta kaydetsin? TXT mi? MD mi');
  assert.ok(quoteIsValid(TEXT, loose));
  assert.equal(locate(TEXT, 'internet yoksa da çalışabilir mi.', 1)!.quote, 'internet yoksa da çalışabilir mi');
  assert.equal(locate(TEXT, 'something the user never said', 1), undefined);
  assert.equal(locate('mi mi mi mi', 'mi mi', 1), undefined); // ambiguous
});

test('cardsFromItems: full rewritten text, linked quote, privacy rules become constraints', () => {
  const text = 'Make a weekly summary. Redact tokens and API keys. Maybe a Slack bot.';
  const cards = cardsFromItems(text, [
    { type: 'idea', text: 'A tool that writes a weekly summary of the logs for the team, with a very long sentence that must not be cut', quote: 'Make a weekly summary.' },
    { type: 'need', text: 'Redact tokens and API keys from the logs.', quote: 'redact tokens and api keys' },
    { type: 'option', text: 'Maybe later: a Slack bot.', quote: 'Maybe a Slack bot.' },
  ], 3, (() => { let n = 0; return () => `m${++n}`; })(), 'NOW', 'gemma4-12b');
  assert.deepEqual(cards.map((c) => c.type), ['idea', 'constraint', 'option']);
  assert.ok(cards[0].title.endsWith('must not be cut'));
  assert.ok(cards.every((c) => c.source && quoteIsValid(text, c.source)));
  assert.equal(cards[0].history[0].action, 'suggested by gemma4-12b');
  // a re-split that rewrites an already kept point the same way does not add it twice
  let ws = mergeSuggestions({ ...emptyWorkspace(), sourceText: text, sourceRevision: 3 }, cards);
  ws = confirmCard(ws, 'm2', 'NOW');
  ws = mergeSuggestions(ws, [{ ...cards[1], id: 'x', source: undefined }]);
  assert.equal(ws.cards.filter((c) => c.title.startsWith('Redact')).length, 1);
});

test('parseItems / runExtract: junk dropped, falls back to the next engine', async () => {
  assert.equal(parseItems('no json'), null);
  assert.deepEqual(parseItems('{"items":[{"type":"banana","text":"x y z","quote":""},{"type":"need","text":"Works offline.","quote":"offline"}]}'), [
    { type: 'need', text: 'Works offline.', quote: 'offline' },
  ]);
  const tried: string[] = [];
  const r = await runExtract('thought', 'en', async (e) => {
    tried.push(e);
    return e === 'a' ? 'nope' : '{"items":[{"type":"idea","text":"A tool.","quote":"thought"}]}';
  }, ['a', 'b']);
  assert.deepEqual(tried, ['a', 'b']);
  assert.equal(r.engine, 'b');
  assert.match(buildExtractPrompt('X', 'tr'), /privacy, security[\s\S]*in Turkish[\s\S]*X$/);
});

test('rules: privacy and "must not" requests are constraints', () => {
  for (const s of ['Redact tokens.', 'No personal data in logs.', 'Verilerim dışarı gitmesin.', 'Şifreler gizli kalsın.', 'Prompt yanlış çevrilmesin.']) {
    assert.equal(classify(s), 'constraint', s);
  }
  assert.equal(classify('Raporlar PDF olarak indirilebilsin.'), 'need');
});

test('cardsFromItems: what the user asked stays a question, even if the model made it a decision', () => {
  const text = 'Çeviri anlık olmalı ama internet yoksa da çalışabilir mi? Belki İngilizce.';
  const [c] = cardsFromItems(text, [{ type: 'constraint', text: 'Sistem internetsiz çalışmalıdır.', quote: 'internet yoksa da çalışabilir mi' }], 1, () => 'q1', 'NOW', 'm');
  assert.equal(c.type, 'question');
  assert.equal(c.source!.quote, 'internet yoksa da çalışabilir mi?');
  assert.equal(c.title, 'internet yoksa da çalışabilir mi?'); // the user's words, not the model's statement
  assert.ok(quoteIsValid(text, c.source!));
});
