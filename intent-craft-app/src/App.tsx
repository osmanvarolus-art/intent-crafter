import { useEffect, useMemo, useState } from 'react';
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
  const { ws, commit, undo, redo, canUndo, canRedo, saving } = useWorkspace();
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('intentcraft.lang') as Lang) || 'en');
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

  return (
    <I18n.Provider value={i18n}>
      <div className="app">
        <Header
          live={provider.live}
          saving={saving}
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
            onAnalyze={() =>
              commit((w) => rules.mergeSuggestions(w, provider.extract(w.sourceText, w.sourceRevision, newId, now())))
            }
            onNaturalPause={() => {
              if (ws.sourceText.trim()) {
                commit((w) => rules.mergeSuggestions(w, provider.extract(w.sourceText, w.sourceRevision, newId, now())));
              }
            }}
          />
          <Board cards={ws.cards} selectedId={selectedId} actions={actions} />
          <LearnPanel text={ws.sourceText} cards={ws.cards} onAnswer={actions.answer} onSelect={actions.select} />
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
