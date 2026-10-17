// Runnable check for the product invariants: `npm test` (node --test, native TS type stripping).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addPrecheck, addReportedEvidence, sanitizeWorkspace, answerQuestion, applySourceEdit, buildMarkdown, confirmCard, editCard, emptyWorkspace,
  markReviewed, rejectCard, mergeSuggestions, packageStatus, preparePackage, quoteIsValid, readiness, setEvidenceStatus,
} from '../src/domain/logic.ts';
import { classify, demoProvider, sentenceSpans } from '../src/providers/demoProvider.ts';

const NOW = '2026-01-01T00:00:00.000Z';
const TEXT =
  'Fikirlerimi konuşarak anlatmak istiyorum. Belki kartları otomatik taşıyabilir ama yanlış anlarsa kontrol bende kalsın. Hangi adımda onay istesin?';

let n = 0;
const id = () => `c${++n}`;
const analysed = () => {
  n = 0;
  const ws = { ...emptyWorkspace(), sourceText: TEXT, sourceRevision: 1 };
  return mergeSuggestions(ws, demoProvider.extract(TEXT, 1, id, NOW));
};

test('demo provider: exact quotes, clause split, types', () => {
  const ws = analysed();
  assert.deepEqual(ws.cards.map((c) => c.type), ['need', 'option', 'constraint', 'question']);
  for (const c of ws.cards) {
    assert.ok(quoteIsValid(TEXT, c.source!), c.source!.quote);
    assert.equal(c.origin, 'ai');
    assert.equal(c.approval, 'suggested');
  }
  assert.equal(classify('Sadece Türkçe olmalı'), 'constraint');
  assert.equal(sentenceSpans('  a.  ').length, 0);
});

test('AI suggestion becomes a decision only via confirm, and stays AI-originated', () => {
  let ws = analysed();
  assert.equal(readiness(ws).find((r) => r.id === 'has_confirmed')!.ok, false);
  ws = confirmCard(ws, 'c3', NOW);
  const c = ws.cards.find((x) => x.id === 'c3')!;
  assert.equal(c.approval, 'confirmed');
  assert.equal(c.origin, 'ai');
  // questions cannot be confirmed, only answered
  assert.equal(confirmCard(ws, 'c4', NOW).cards.find((x) => x.id === 'c4')!.approval, 'suggested');
});

test('source edit marks linked card needs_review without erasing approval', () => {
  let ws = confirmCard(analysed(), 'c3', NOW);
  ws = applySourceEdit(ws, TEXT.replace('kontrol bende kalsın', 'kontrol sende kalsın'), NOW);
  const c = ws.cards.find((x) => x.id === 'c3')!;
  assert.equal(c.freshness, 'needs_review');
  assert.equal(c.approval, 'confirmed');
  assert.equal(ws.cards.find((x) => x.id === 'c1')!.freshness, 'current');
  assert.equal(readiness(ws).find((r) => r.id === 'confirmed_current')!.ok, false);
  ws = markReviewed(ws, 'c3', NOW);
  assert.equal(ws.cards.find((x) => x.id === 'c3')!.source, undefined); // quote gone -> link dropped, not faked
});

test('edit earlier in the text moves later quotes instead of marking them stale', () => {
  let ws = confirmCard(analysed(), 'c4', NOW);
  const later = ws.cards.find((x) => x.id === 'c4')!.source!;
  ws = applySourceEdit(ws, TEXT.replace('konuşarak anlatmak', 'sesli olarak anlatmak'), NOW);
  const c = ws.cards.find((x) => x.id === 'c4')!;
  assert.equal(c.freshness, 'current');
  assert.ok(c.source!.start > later.start);
  assert.ok(quoteIsValid(ws.sourceText, c.source!));
  assert.equal(ws.cards.find((x) => x.id === 'c1')!.freshness, 'needs_review'); // its own words changed
  // a quote that now appears twice is ambiguous: review, never a guess
  ws = applySourceEdit(ws, ws.sourceText + ' ' + c.source!.quote, NOW);
  assert.equal(ws.cards.find((x) => x.id === 'c4')!.freshness, 'current'); // offset still exact, untouched
});

test('task package: deterministic, excludes unconfirmed options, goes stale on edit', () => {
  let ws = confirmCard(analysed(), 'c3', NOW);
  ws = answerQuestion(ws, 'c4', 'Before every file change', NOW);
  assert.equal(readiness(ws).find((r) => r.id === 'agent_precheck')!.ok, false); // the agent has not read it yet
  ws = addPrecheck(ws, [], 'test-model', id, NOW);
  assert.ok(readiness(ws).every((r) => r.ok));
  assert.equal(buildMarkdown(ws), buildMarkdown(ws));
  ws = preparePackage(ws, NOW);
  assert.equal(packageStatus(ws), 'current');
  const md = ws.pkg!.markdown;
  assert.match(md, /kontrol bende kalsın/);
  assert.match(md, /## Out of scope[\s\S]*Belki kartları/);
  assert.doesNotMatch(md.split('## Confirmed decisions')[1].split('## Clarifications')[0], /Belki kartları/);
  ws = editCard(ws, 'c3', { title: 'User keeps control', body: 'Changed' }, NOW);
  assert.equal(packageStatus(ws), 'needs_review');
});

test('re-analysis keeps user-touched cards', () => {
  let ws = confirmCard(analysed(), 'c3', NOW);
  ws = mergeSuggestions(ws, demoProvider.extract(TEXT, 1, () => `x${++n}`, NOW));
  assert.equal(ws.cards.filter((c) => c.source?.quote === 'yanlış anlarsa kontrol bende kalsın.').length, 1);
  assert.ok(ws.cards.some((c) => c.id === 'c3' && c.approval === 'confirmed'));
});

test('agent evidence is reported until the user verifies it', () => {
  let ws = addReportedEvidence(emptyWorkspace(), '- Tests pass\n\n2) Added confirm gate', id);
  assert.deepEqual(ws.evidence.map((e) => [e.claim, e.status]), [['Tests pass', 'reported'], ['Added confirm gate', 'reported']]);
  ws = setEvidenceStatus(ws, ws.evidence[0].id, 'verified');
  assert.equal(ws.evidence[0].status, 'verified');
  assert.equal(ws.evidence[1].status, 'reported');
});

test('demo provider: decimals, domains and abbreviations do not split a clause', () => {
  const t = 'Version 2.0 must ship before May, e.g. with CSV export. See example.com today.';
  assert.deepEqual(sentenceSpans(t).map((s) => s.quote), [
    'Version 2.0 must ship before May, e.g. with CSV export.', 'See example.com today.',
  ]);
  for (const s of sentenceSpans(t)) assert.equal(t.slice(s.start, s.end), s.quote);
});

test('demo provider: Turkish necessity suffixes and question forms', () => {
  assert.equal(classify('Uygulama hızlı açılmalı.'), 'need');
  assert.equal(classify('Kullanıcı verisi paylaşılmamalı.'), 'constraint');
  assert.equal(classify('Bildirimler kapatılabilmeli mi.'), 'question');
  assert.equal(classify('Hangi dilleri desteklesin.'), 'question');
  assert.equal(classify('Photos are required.'), 'constraint');
  assert.equal(classify('Raporlar PDF olarak indirilebilsin.'), 'need');
  assert.equal(classify('Giriş Google hesabıyla olsun.'), 'need');
  assert.equal(classify('Bu kesin.'), 'idea');
});

test('pre-check questions become answerable cards; dismissed ones are left to the agent in the package', () => {
  let ws = confirmCard(analysed(), 'c3', NOW);
  ws = answerQuestion(ws, 'c4', 'Before every file change', NOW);
  ws = addPrecheck(ws, [{ q: 'Which device do you use?', why: 'Changes the platform.' }, { q: 'Which device do you use?' }, { q: '  ' }], 'gemma4-12b', id, NOW);
  const asked = ws.cards.filter((c) => c.history[0].action.includes('pre-check'));
  assert.equal(asked.length, 1); // duplicate and empty questions dropped
  assert.equal(asked[0].type, 'question');
  assert.equal(asked[0].source, undefined);
  assert.equal(ws.precheck?.engine, 'gemma4-12b');
  assert.equal(readiness(ws).find((r) => r.id === 'questions_answered')!.ok, false);
  ws = rejectCard(ws, asked[0].id, NOW);
  assert.ok(readiness(ws).every((r) => r.ok));
  const md = buildMarkdown(ws);
  assert.match(md, /Left to your judgement[\s\S]*Which device do you use\?/);
});

test('package prints a truncated demo title and its sentence once', () => {
  const long = 'Benim istediğim şey şu: ben Claude ile sohbet ederken konuşmalarımı takip etsin ve Fransızcaya çevirsin.';
  n = 0;
  let ws = mergeSuggestions({ ...emptyWorkspace(), sourceText: long, sourceRevision: 1 }, demoProvider.extract(long, 1, id, NOW));
  ws = confirmCard(ws, 'c1', NOW);
  const md = buildMarkdown(ws);
  assert.equal(md.split(long).length - 1, 3); // original thought, decision, source quote: not a fourth copy
  assert.doesNotMatch(md, /…\*\*:/);
});

test('sanitizeWorkspace keeps good cards and drops damaged ones instead of crashing the app', () => {
  n = 0;
  const good = analysed();
  const raw = JSON.parse(JSON.stringify(good));
  raw.cards.push({ id: 'x', type: 'banana', title: 't', body: '', origin: 'ai', approval: 'suggested', freshness: 'current', revision: 1, history: [] });
  raw.cards.push({ ...raw.cards[0], id: 'y', history: undefined });
  raw.cards.push({ ...raw.cards[0], id: 'z', source: { start: 5, end: 2, quote: 'a', revision: 1 } });
  const ws = sanitizeWorkspace(raw)!;
  assert.equal(ws.cards.length, good.cards.length);
  assert.equal(sanitizeWorkspace({ schema: 2 }), null);
  assert.equal(sanitizeWorkspace('{broken'), null);
});

test('source edit: quotes before and after the edit stay current and exact', () => {
  n = 0;
  let ws = analysed();
  for (const c of ws.cards) ws = confirmCard(ws, c.id, NOW);
  const edited = 'Ek bir cümle. ' + TEXT;
  ws = applySourceEdit(ws, edited, NOW);
  for (const c of ws.cards) {
    assert.equal(c.freshness, 'current', c.title);
    assert.ok(quoteIsValid(edited, c.source!), c.title);
  }
});

test('demo provider: short follow-up questions join the question before them', () => {
  const t = 'Hangi formatta kaydetsin? TXT mi? MD mi? Hızlı olsun.';
  const cards = demoProvider.extract(t, 1, id, NOW);
  assert.deepEqual(cards.map((c) => [c.type, c.source!.quote]), [
    ['question', 'Hangi formatta kaydetsin? TXT mi? MD mi?'],
    ['need', 'Hızlı olsun.'],
  ]);
  assert.ok(cards.every((c) => quoteIsValid(t, c.source!)));
});

test('pre-check: a question already asked in other words is not added again', () => {
  let ws = { ...emptyWorkspace(), sourceText: 'x', sourceRevision: 1 };
  ws = addPrecheck(ws, [{ q: 'Çeviriler hangi formatta kaydedilmelidir; TXT mi yoksa MD mi?' }], 'm', id, NOW);
  ws = addPrecheck(ws, [
    { q: 'Çevirilerin kaydedileceği dosya formatı olarak TXT mi yoksa Markdown (MD) formatını mı tercih edersiniz?' },
    { q: 'Claude ile hangi platform üzerinden konuşuyorsunuz?' },
  ], 'm', id, NOW);
  assert.deepEqual(ws.cards.map((c) => c.title.slice(0, 20)), ['Çeviriler hangi form', 'Claude ile hangi pla']);
});
