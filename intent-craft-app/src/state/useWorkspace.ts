import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { emptyWorkspace, sanitizeWorkspace } from '../domain/logic.ts';
import type { Workspace } from '../domain/types.ts';

export const KEY = 'intentcraft.workspace.v1';
const LIMIT = 100;

export interface History {
  past: Workspace[];
  present: Workspace;
  future: Workspace[];
  /** Consecutive commits with the same key (e.g. typing) merge into one undo step. */
  lastKey?: string;
}

export type Action =
  | { kind: 'commit'; fn: (ws: Workspace) => Workspace; key?: string }
  | { kind: 'undo' }
  | { kind: 'redo' };

export function reducer(h: History, a: Action): History {
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
    return sanitizeWorkspace(JSON.parse(json ?? 'null'));
  } catch {
    return null;
  }
}

/** Read the saved workspace. Damaged data is copied aside before anything is dropped, never silently lost. */
export function load(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage, stamp = Date.now()): Workspace {
  let raw: string | null = null;
  try {
    raw = storage.getItem(KEY);
  } catch {
    return emptyWorkspace(); // storage blocked (private window): work in memory
  }
  if (raw === null) return emptyWorkspace();
  const ws = parse(raw);
  let stored: { cards?: unknown[]; evidence?: unknown[] } | null = null;
  try {
    stored = JSON.parse(raw);
  } catch {
    /* not JSON at all */
  }
  const dropped = !ws || ws.cards.length !== stored?.cards?.length || ws.evidence.length !== stored?.evidence?.length;
  if (dropped) {
    try {
      storage.setItem(`${KEY}.damaged-${stamp}`, raw);
    } catch {
      /* no room for the backup: keep going with what could be read */
    }
  }
  return ws ?? emptyWorkspace();
}

export function useWorkspace() {
  const [h, dispatch] = useReducer(reducer, undefined, () => ({ past: [], present: load(), future: [] }));
  // What storage holds now; the header compares against it instead of guessing.
  const [saved, setSaved] = useState<Workspace>(h.present);
  const [saveFailed, setSaveFailed] = useState(false);
  const savedJson = useRef<string | null>(null);

  useEffect(() => {
    if (h.present === saved) return;
    const t = setTimeout(() => {
      try {
        const json = JSON.stringify(h.present);
        if (json !== savedJson.current) localStorage.setItem(KEY, json);
        savedJson.current = json;
        setSaveFailed(false);
      } catch {
        setSaveFailed(true); // storage full or blocked: the header says so, the work stays in memory
      }
      setSaved(h.present);
    }, 300);
    return () => clearTimeout(t);
  }, [h.present, saved]);

  // Another tab saved: take its version (as an undoable step) instead of overwriting it on our next save.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || e.newValue === savedJson.current) return;
      const ws = parse(e.newValue);
      if (!ws) return;
      savedJson.current = e.newValue;
      dispatch({ kind: 'commit', fn: () => ws, key: 'other-tab' });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const commit = useCallback((fn: (ws: Workspace) => Workspace, key?: string) => dispatch({ kind: 'commit', fn, key }), []);
  const undo = useCallback(() => dispatch({ kind: 'undo' }), []);
  const redo = useCallback(() => dispatch({ kind: 'redo' }), []);

  return {
    ws: h.present,
    commit,
    undo,
    redo,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
    saving: h.present !== saved,
    saveFailed,
  };
}

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID().slice(0, 8);
