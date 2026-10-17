import test from 'node:test';
import assert from 'node:assert/strict';
import { KEY, load, reducer, type History } from '../src/state/useWorkspace.ts';
import { emptyWorkspace } from '../src/domain/logic.ts';

const memory = (init: Record<string, string>) => {
  const data = { ...init };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
};

test('load: damaged data is backed up before anything is dropped', () => {
  const s = memory({ [KEY]: '{broken' });
  assert.deepEqual(load(s, 42), emptyWorkspace());
  assert.equal(s.data[`${KEY}.damaged-42`], '{broken');
  const ok = memory({ [KEY]: JSON.stringify(emptyWorkspace()) });
  load(ok, 43);
  assert.equal(Object.keys(ok.data).length, 1); // healthy data: no backup noise
});

test('reducer: no-op commit keeps history, typing merges into one undo step, undo/redo round-trip', () => {
  const a = emptyWorkspace();
  let h: History = { past: [], present: a, future: [] };
  assert.equal(reducer(h, { kind: 'commit', fn: (w) => w }), h);
  h = reducer(h, { kind: 'commit', fn: (w) => ({ ...w, sourceText: 'a' }), key: 'source' });
  h = reducer(h, { kind: 'commit', fn: (w) => ({ ...w, sourceText: 'ab' }), key: 'source' });
  assert.equal(h.past.length, 1);
  h = reducer(h, { kind: 'undo' });
  assert.equal(h.present, a);
  h = reducer(h, { kind: 'redo' });
  assert.equal(h.present.sourceText, 'ab');
  assert.equal(reducer({ ...h, future: [] }, { kind: 'redo' }).present.sourceText, 'ab');
});
