import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { emptyWorkspace, isWorkspace } from '../domain/logic.ts';
import type { Workspace } from '../domain/types.ts';

const KEY = 'intentcraft.workspace.v1';
const LIMIT = 100;

interface History {
  past: Workspace[];
  present: Workspace;
  future: Workspace[];
  /** Consecutive commits with the same key (e.g. typing) merge into one undo step. */
  lastKey?: string;
}

type Action =
  | { kind: 'commit'; fn: (ws: Workspace) => Workspace; key?: string }
  | { kind: 'undo' }
  | { kind: 'redo' };

function reducer(h: History, a: Action): History {
  switch (a.kind) {
    case 'commit': {
      const next = a.fn(h.present);
      if (next === h.present) return h;
      const merge = a.key !== undefined && a.key === h.lastKey;
      return { past: merge ? h.past : [...h.past, h.present].slice(-LIMIT), present: next, future: [], lastKey: a.key };
    }
    case 'undo':
      if (!h.past.length) return h;
      return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
    case 'redo':
      if (!h.future.length) return h;
      return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
  }
}

function parse(json: string | null): Workspace | null {
  try {
    const raw = JSON.parse(json ?? 'null');
    return isWorkspace(raw) ? raw : null;
  } catch {
    return null; // corrupt storage: start clean rather than crash
  }
}

const load = (): Workspace => parse(localStorage.getItem(KEY)) ?? emptyWorkspace();

export function useWorkspace() {
  const [h, dispatch] = useReducer(reducer, undefined, () => ({ past: [], present: load(), future: [] }));
  const [saving, setSaving] = useState(false);
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    const t = setTimeout(() => {
      try {
        const json = JSON.stringify(h.present);
        if (localStorage.getItem(KEY) !== json) localStorage.setItem(KEY, json);
      } catch {
        /* storage full or blocked: keep working in memory */
      }
      setSaving(false);
    }, 300);
    return () => clearTimeout(t);
  }, [h.present]);

  // Another tab saved: take its version (as an undoable step) instead of overwriting it on our next save.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      const ws = parse(e.newValue);
      if (ws) dispatch({ kind: 'commit', fn: () => ws, key: 'other-tab' });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const commit = useCallback((fn: (ws: Workspace) => Workspace, key?: string) => {
    setSaving(true);
    dispatch({ kind: 'commit', fn, key });
  }, []);
  const undo = useCallback(() => {
    setSaving(true);
    dispatch({ kind: 'undo' });
  }, []);
  const redo = useCallback(() => {
    setSaving(true);
    dispatch({ kind: 'redo' });
  }, []);

  return { ws: h.present, commit, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0, saving };
}

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID().slice(0, 8);
