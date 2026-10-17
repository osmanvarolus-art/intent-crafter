import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, parseQuestions, runPrecheck } from '../server/precheck.ts';

test('parseQuestions: reads fenced or wrapped JSON, drops junk, caps at six', () => {
  const text = 'Here you go:\n```json\n{"questions":[{"q":"Hangi platform?","why":"Yöntem değişir."},{"q":""},{"x":1},' +
    Array.from({ length: 8 }, (_, i) => `{"q":"Soru numara ${i}"}`).join(',') + ']}\n```';
  const qs = parseQuestions(text);
  assert.equal(qs.length, 6);
  assert.deepEqual(qs[0], { q: 'Hangi platform?', why: 'Yöntem değişir.' });
  assert.deepEqual(parseQuestions('no json'), []);
  assert.deepEqual(parseQuestions('{"questions": "nope"}'), []);
});

test('runPrecheck: falls through to the next engine and reports which one answered', async () => {
  const tried: string[] = [];
  const result = await runPrecheck('draft', 'tr', async (engine) => {
    tried.push(engine);
    if (engine === 'local-a') throw new Error('HTTP 500');
    if (engine === 'local-b') return 'sorry, I cannot';
    return '{"questions":[{"q":"Kim kullanacak?","why":"Kapsam değişir."}]}';
  }, ['local-a', 'local-b', 'claude']);
  assert.deepEqual(tried, ['local-a', 'local-b', 'claude']);
  assert.equal(result.engine, 'claude');
  assert.equal(result.questions.length, 1);
});

test('runPrecheck: an explicit empty list is an answer, not a failure', async () => {
  const result = await runPrecheck('draft', 'en', async () => '{"questions": []}', ['m']);
  assert.deepEqual(result, { engine: 'm', questions: [] });
  await assert.rejects(runPrecheck('draft', 'en', async () => 'x', ['m']), /m: no usable answer/);
});

test('buildPrompt: asks in the user\'s language and carries the draft', () => {
  assert.match(buildPrompt('MY DRAFT', 'tr'), /in Turkish[\s\S]*MY DRAFT$/);
  assert.match(buildPrompt('MY DRAFT', 'en'), /in English/);
});
