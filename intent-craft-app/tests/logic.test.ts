// Runnable check for the product invariants: `npm test` (node --test, native TS type stripping).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addReportedEvidence, answerQuestion, applySourceEdit, buildMarkdown, confirmCard, editCard, emptyWorkspace,
  markReviewed, mergeSuggestions, packageStatus, preparePackage, quoteIsValid, readiness, setEvidenceStatus,
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

test('task package: deterministic, excludes unconfirmed options, goes stale on edit', () => {
  let ws = confirmCard(analysed(), 'c3', NOW);
  ws = answerQuestion(ws, 'c4', 'Before every file change', NOW);
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
