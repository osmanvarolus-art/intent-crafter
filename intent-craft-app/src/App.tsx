import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { appendFinalTranscript } from './domain/voice.ts';
import * as rules from './domain/logic.ts';
import { demoProvider } from './providers/demoProvider.ts';
import { cardsFromItems, type ModelItem } from './providers/modelProvider.ts';
import { newId, now, useWorkspace } from './state/useWorkspace.ts';
import { I18n, STRINGS, type Lang } from './i18n.ts';
import { Header } from './components/Header.tsx';
import { ThoughtPanel } from './components/ThoughtPanel.tsx';
import { CheckStep, type PointActions } from './components/CheckStep.tsx';
import { QuestionsStep } from './components/QuestionsStep.tsx';
import { TaskStep } from './components/TaskStep.tsx';
import { Steps, type Step, type StepStatus } from './components/Steps.tsx';
import type { Workspace } from './domain/types.ts';

/** The first step that still needs the user. */
function nextStep(ws: Workspace): Step {
  if (!ws.sourceText.trim() || !ws.cards.length) return 'tell';
  if (ws.cards.some((c) => c.type !== 'question' && ((c.approval === 'suggested' && c.type !== 'option') || c.freshness === 'needs_review'))) return 'check';
  if (!ws.precheck || ws.cards.some((c) => c.type === 'question' && !c.answer && c.approval !== 'rejected')) return 'questions';
  return 'task';
}

const rulesProvider = demoProvider;
const ARCHIVE = 'intentcraft.archive.v1';

/** Keep the last 20 ideas aside before starting a new one (Undo also brings the last one back). */
function archive(ws: Workspace) {
  if (!ws.sourceText.trim() && !ws.cards.length) return;
  try {
    const list = JSON.parse(localStorage.getItem(ARCHIVE) ?? '[]') as unknown[];
    localStorage.setItem(ARCHIVE, JSON.stringify([{ at: new Date().toISOString(), ws }, ...list].slice(0, 20)));
  } catch {
    /* storage full or blocked: Undo still has it */
  }
}
const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export default function App() {
  const { ws, commit, undo, redo, canUndo, canRedo, saving, saveFailed } = useWorkspace();
  const [precheck, setPrecheck] = useState<{ running: boolean; message?: string; error?: boolean; detail?: string }>({ running: false });
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem('intentcraft.lang');
    return saved && Object.hasOwn(STRINGS, saved) ? (saved as Lang) : 'en'; // unknown or corrupt value: never crash
  });
  const [selectedId, setSelectedId] = useState<string>();
  const [step, setStep] = useState<Step>(() => nextStep(ws));
  const [split, setSplit] = useState<{ running: boolean; engine?: string; error?: string }>({ running: false });
  // The workspace as last rendered, for callbacks that fire after React has applied their own updates.
  const latestWs = useRef(ws);
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const [splitAt, setSplitAt] = useState(-1);
  useLayoutEffect(() => {
    latestWs.current = ws;
  });
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

  const actions: PointActions & { answer: (id: string, a: string) => void } = useMemo(
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
  // A language model writes the points (goal, needs, constraints, options, questions) from the user's words;
  // if it cannot be reached, simple rules split the sentences instead and the header says so.
  const suggest = async (from: Workspace = ws) => {
    const text = from.sourceText;
    const rev = from.sourceRevision;
    if (!text.trim()) return;
    setStep('check');
    setSplit({ running: true });
    let cards;
    let engine = 'rules';
    let error: string | undefined;
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, lang }),
      });
      const body = (await res.json()) as { engine?: string; items?: ModelItem[]; error?: string };
      if (!res.ok || !body.items) throw new Error(body.error ?? `HTTP ${res.status}`);
      engine = body.engine ?? 'model';
      cards = cardsFromItems(text, body.items, rev, newId, now(), engine);
    } catch (e) {
      error = e instanceof Error ? e.message.slice(0, 160) : String(e);
      cards = rulesProvider.extract(text, rev, newId, now());
    }
    commit((w) => (w.sourceRevision === rev ? rules.mergeSuggestions(w, cards) : w));
    setSplit({ running: false, engine, error });
    setSplitAt(rev);
    // On a phone the points land below the text: bring them into view.
    if (window.matchMedia('(max-width: 900px)').matches) stepTitle.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const newIdea = (keepText = false) => {
    archive(ws);
    const fresh = keepText ? { ...rules.emptyWorkspace(), sourceText: ws.sourceText, sourceRevision: ws.sourceRevision } : rules.emptyWorkspace();
    commit(() => fresh);
    setSelectedId(undefined);
    setPrecheck({ running: false });
    setSplit({ running: false });
    if (keepText) void suggest(fresh);
    else setStep('tell');
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
      setPrecheck({ running: false, message: i18n.t.precheckDone(added), detail: engine });
    } catch (e) {
      setPrecheck({ running: false, error: true, message: i18n.t.precheckFailed, detail: e instanceof Error ? e.message : String(e) });
    }
  };

  const goQuestions = () => {
    setStep('questions');
    if (!ws.precheck && ws.sourceText.trim() && !precheck.running) void runPrecheck(); // the agent reads as soon as you get here
  };
  const go = (s: Step) => (s === 'questions' ? goQuestions() : setStep(s));

  const t = i18n.t;
  const points = ws.cards.filter((c) => c.type !== 'question');
  const toCheck = points.filter((c) => (c.approval === 'suggested' && c.type !== 'option') || c.freshness === 'needs_review').length;
  const openQuestions = ws.cards.filter((c) => c.type === 'question' && !c.answer && c.approval !== 'rejected').length;
  const status: Record<Step, StepStatus> = {
    tell: { done: !!ws.sourceText.trim() && points.length > 0 },
    check: { done: points.length > 0 && toCheck === 0, note: points.length ? (toCheck ? t.left(toCheck) : undefined) : undefined },
    questions: { done: !!ws.precheck && openQuestions === 0, note: openQuestions ? t.left(openQuestions) : undefined },
    task: { done: !!ws.pkg && rules.packageStatus(ws) === 'current' },
  };

  return (
    <I18n.Provider value={i18n}>
      <div className="app">
        <Header
          notice={split.engine === 'rules' ? i18n.t.demoBanner : undefined}
          noticeDetail={split.error}
          onNewIdea={() => newIdea()}
          saving={saving}
          saveFailed={saveFailed}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          onToggleLang={() => setLang((l) => (l === 'en' ? 'tr' : 'en'))}
        />
        <Steps current={step} status={status} onPick={go} />
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
            onAnalyze={() => void suggest()}
            // After dictation stops: let React apply the last phrase, then split the text it produced.
            onVoiceFinished={() => setTimeout(() => void suggest(latestWs.current), 0)}
            splitting={split.running}
            analyzePrimary={!points.length || ws.sourceRevision !== splitAt}
          />
          <section className="panel step-panel" aria-labelledby="step-title">
            <h2 id="step-title" ref={stepTitle} tabIndex={-1}>{t.steps[step === 'tell' && points.length ? 'check' : step]}</h2>
            {(step === 'check' || step === 'tell') && (
              <CheckStep cards={ws.cards} selectedId={selectedId} actions={actions} onNext={goQuestions} split={split} onStartOver={() => newIdea(true)} />
            )}
            {step === 'questions' && (
              <QuestionsStep
                cards={ws.cards}
                onAnswer={actions.answer}
                onLeave={actions.reject}
                onReopen={actions.reopen}
                onSelect={actions.select}
                onPrecheck={runPrecheck}
                precheck={precheck}
                precheckDone={!!ws.precheck}
                precheckStale={!!ws.precheck && ws.precheck.sourceRevision !== ws.sourceRevision}
                onNext={() => setStep('task')}
              />
            )}
            {step === 'task' && (
              <TaskStep
                ws={ws}
                onPrepare={() => commit((w) => rules.preparePackage(w, now()))}
                onAddEvidence={(r) => commit((w) => rules.addReportedEvidence(w, r, newId))}
                onEvidence={(id, s) => commit((w) => rules.setEvidenceStatus(w, id, s))}
                onGo={go}
              />
            )}
          </section>
        </main>
      </div>
    </I18n.Provider>
  );
}
