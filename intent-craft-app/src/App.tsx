import { useEffect, useMemo, useState } from 'react';
import { appendFinalTranscript } from './domain/voice.ts';
import * as rules from './domain/logic.ts';
import { demoProvider } from './providers/demoProvider.ts';
import { newId, now, useWorkspace } from './state/useWorkspace.ts';
import { I18n, STRINGS, type Lang } from './i18n.ts';
import { Header } from './components/Header.tsx';
import { ThoughtPanel } from './components/ThoughtPanel.tsx';
import { Board } from './components/Board.tsx';
import { LearnPanel } from './components/LearnPanel.tsx';
import { TaskDrawer } from './components/TaskDrawer.tsx';
import type { CardActions } from './components/CardView.tsx';

const provider = demoProvider;
const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export default function App() {
  const { ws, commit, undo, redo, canUndo, canRedo, saving, saveFailed } = useWorkspace();
  const [precheck, setPrecheck] = useState<{ running: boolean; message?: string; error?: boolean }>({ running: false });
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem('intentcraft.lang');
    return saved && Object.hasOwn(STRINGS, saved) ? (saved as Lang) : 'en'; // unknown or corrupt value: never crash
  });
  const [selectedId, setSelectedId] = useState<string>();
  const i18n = useMemo(() => ({ t: STRINGS[lang], lang }), [lang]);

  useEffect(() => {
    localStorage.setItem('intentcraft.lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  // App-level undo/redo only outside text fields, which keep their native undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || isEditable(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const actions: CardActions = useMemo(
    () => ({
      select: (id) => setSelectedId((cur) => (cur === id ? undefined : id)),
      confirm: (id) => commit((w) => rules.confirmCard(w, id, now())),
      reject: (id) => commit((w) => rules.rejectCard(w, id, now())),
      reopen: (id) => commit((w) => rules.reopenCard(w, id, now())),
      reviewed: (id) => commit((w) => rules.markReviewed(w, id, now())),
      edit: (id, patch) => commit((w) => rules.editCard(w, id, patch, now())),
      answer: (id, a) => commit((w) => rules.answerQuestion(w, id, a, now())),
    }),
    [commit],
  );

  const selected = ws.cards.find((c) => c.id === selectedId);

  // Ids and timestamps are made here, outside the reducer, so a replayed commit gives the same result.
  const suggest = () => {
    const fresh = provider.extract(ws.sourceText, ws.sourceRevision, newId, now());
    commit((w) => (w.sourceRevision === ws.sourceRevision ? rules.mergeSuggestions(w, fresh) : w));
  };

  const runPrecheck = async () => {
    setPrecheck({ running: true });
    // The agent sees the draft task and the questions already on the user's list, so it does not ask them again.
    const open = ws.cards.filter((c) => c.type === 'question' && !c.answer && c.approval !== 'rejected').map((c) => `- ${c.title}`);
    const draft = rules.buildMarkdown(ws) + (open.length ? `\n## Questions already on the user's list (do not repeat)\n\n${open.join('\n')}\n` : '');
    try {
      const res = await fetch('/api/precheck', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draft, lang }),
      });
      const body = (await res.json()) as { engine?: string; questions?: Array<{ q: string; why: string }>; error?: string };
      if (!res.ok || !body.questions) throw new Error(body.error ?? `HTTP ${res.status}`);
      const at = now();
      const engine = body.engine ?? '?';
      const added = rules.addPrecheck(ws, body.questions, engine, newId, at).precheck?.questions ?? 0;
      commit((w) => rules.addPrecheck(w, body.questions!, engine, newId, at));
      setPrecheck({ running: false, message: i18n.t.precheckDone(added, engine) });
    } catch (e) {
      setPrecheck({ running: false, error: true, message: `${i18n.t.precheckFailed}: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  return (
    <I18n.Provider value={i18n}>
      <div className="app">
        <Header
          live={provider.live}
          saving={saving}
          saveFailed={saveFailed}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          onToggleLang={() => setLang((l) => (l === 'en' ? 'tr' : 'en'))}
        />
        <main className="workspace">
          <ThoughtPanel
            text={ws.sourceText}
            highlight={selected?.source}
            highlightValid={!!selected?.source && rules.quoteIsValid(ws.sourceText, selected.source)}
            onChange={(text) => commit((w) => rules.applySourceEdit(w, text, now()), 'source')}
            onVoiceText={(chunk, cursor, moveCursor) => {
              const at = now();
              commit((w) => {
                const { text, nextCursor } = appendFinalTranscript(w.sourceText, chunk, cursor);
                moveCursor(nextCursor);
                return rules.applySourceEdit(w, text, at);
              });
            }}
            onAnalyze={suggest}
            onNaturalPause={() => {
              // Runs after the latest spoken text was committed; read it from the reducer, not from this render.
              commit((w) => (w.sourceText.trim() ? rules.mergeSuggestions(w, provider.extract(w.sourceText, w.sourceRevision, newId, now())) : w));
            }}
          />
          <Board cards={ws.cards} selectedId={selectedId} actions={actions} />
          <LearnPanel
            text={ws.sourceText}
            cards={ws.cards}
            onAnswer={actions.answer}
            onSelect={actions.select}
            onDismiss={actions.reject}
            onPrecheck={runPrecheck}
            precheck={precheck}
            precheckStale={!!ws.precheck && ws.precheck.sourceRevision !== ws.sourceRevision}
            canPrecheck={!!ws.sourceText.trim()}
          />
        </main>
        <TaskDrawer
          ws={ws}
          onPrepare={() => commit((w) => rules.preparePackage(w, now()))}
          onAddEvidence={(r) => commit((w) => rules.addReportedEvidence(w, r, newId))}
          onEvidence={(id, s) => commit((w) => rules.setEvidenceStatus(w, id, s))}
        />
      </div>
    </I18n.Provider>
  );
}
