import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExtractPrompt, parseItems, runExtract } from '../server/extract.ts';
import { cardsFromItems, locate } from '../src/providers/modelProvider.ts';
import { classify } from '../src/providers/demoProvider.ts';
import { addSuggestions, confirmCard, emptyWorkspace, mergeSuggestions, quoteIsValid } from '../src/domain/logic.ts';

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
  // An open point is shown as a question to answer: a statement ("it is undecided whether...") reads oddly and hides repeats.
  assert.match(buildExtractPrompt('X', 'tr'), /question: [^\n]*direct question[^\n]*ending with "\?"/);
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

test('cardsFromItems: a question the user asked keeps the user\'s words even when the model typed it as a question', () => {
  const text = 'Hangi formatta kaydetsin? TXT mi? MD mi?';
  const [c] = cardsFromItems(text, [{ type: 'question', text: 'Kayıt formatı henüz belirlenmemiştir.', quote: 'Hangi formatta kaydetsin? TXT mi? MD mi?' }], 1, () => 'q', 'NOW', 'm');
  assert.equal(c.title, 'Hangi formatta kaydetsin? TXT mi? MD mi?');
});

test('live points: a continuation sends what is captured and may add nothing; points already on the board stay', async () => {
  const prompt = buildExtractPrompt('Sonra PDF de olsun.', 'tr', ['Not uygulaması', 'Çevrimdışı çalışmalı']);
  assert.match(prompt, /CONTINUES[\s\S]*- Not uygulaması[\s\S]*THOUGHT:\nSonra PDF de olsun\.$/);
  const r = await runExtract('x', 'tr', async () => '{"items": []}', ['m'], ['known']);
  assert.deepEqual(r.items, []);
  // A first pass may find nothing too (a greeting): one engine answers, the next ones are not asked.
  const asked: string[] = [];
  const first = await runExtract('Merhaba, nasılsın?', 'tr', async (e) => (asked.push(e), '{"items": []}'), ['m', 'claude']);
  assert.deepEqual([first.items, asked], [[], ['m']]);
  await assert.rejects(runExtract('x', 'tr', async () => 'not json', ['m']), /no usable answer/);

  const text = 'Bir not uygulaması istiyorum. Çevrimdışı çalışmalı. Sonra PDF de olsun.';
  let n = 0;
  const mk = () => `c${++n}`;
  let ws = addSuggestions({ ...emptyWorkspace(), sourceText: text, sourceRevision: 1 },
    cardsFromItems(text, [{ type: 'idea', text: 'Not uygulaması', quote: 'Bir not uygulaması istiyorum.' }], 1, mk, 'NOW', 'm'));
  ws = confirmCard(ws, 'c1', 'NOW');
  ws = addSuggestions(ws, cardsFromItems(text, [
    { type: 'idea', text: 'Not uygulaması', quote: 'Bir not uygulaması istiyorum.' }, // repeat: ignored
    { type: 'need', text: 'PDF olarak dışa aktarma.', quote: 'Sonra PDF de olsun.' },
  ], 1, mk, 'NOW', 'm'));
  assert.deepEqual(ws.cards.map((c) => [c.id, c.approval]), [['c1', 'confirmed'], ['c3', 'suggested']]);
});
