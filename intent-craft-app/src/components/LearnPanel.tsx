import { useMemo, useState } from 'react';
import type { Card } from '../domain/types.ts';
import { useT } from '../i18n.ts';
import { relevantConcepts } from '../providers/glossary.ts';

export function LearnPanel({ text, cards, onAnswer, onSelect, onDismiss, onPrecheck, precheck, precheckStale, canPrecheck }: {
  text: string;
  cards: Card[];
  onAnswer: (id: string, answer: string) => void;
  onSelect: (id: string) => void;
  /** Leave the question to the agent's judgement. */
  onDismiss: (id: string) => void;
  onPrecheck: () => void;
  precheck: { running: boolean; message?: string; error?: boolean };
  precheckStale: boolean;
  canPrecheck: boolean;
}) {
  const { t, lang } = useT();
  const types = useMemo(() => [...new Set(cards.map((c) => c.type))].sort().join(), [cards]);
  const concepts = useMemo(() => relevantConcepts(text, new Set(types.split(',') as Card['type'][])), [text, types]);
  const open = cards.find((c) => c.type === 'question' && c.approval !== 'rejected' && !c.answer);
  const [answer, setAnswer] = useState('');
  const [deferred, setDeferred] = useState<string | null>(null);

  return (
    <aside className="panel" aria-labelledby="learn-h">
      <div className="panel-head">
        <h2 id="learn-h">{t.learnTitle}</h2>
        <p className="muted small">{t.learnHint}</p>
      </div>

      <div className="precheck stack">
        <button id="precheck" className="btn primary" onClick={onPrecheck} disabled={precheck.running || !canPrecheck}>
          {precheck.running ? t.precheckRunning : t.precheck}
        </button>
        <p className="muted small">{t.precheckHint}</p>
        {precheck.message && (
          <p id="precheck-status" className={`small ${precheck.error ? 'voice-error' : 'note'}`} role="status">{precheck.message}</p>
        )}
        {precheckStale && !precheck.running && <p className="small note">{t.precheckStale}</p>}
      </div>

      <div className="clarify" aria-labelledby="clarify-h">
        <h3 id="clarify-h" className="eyebrow">{t.clarifyTitle}</h3>
        {!open ? (
          <p className="muted small">{t.noQuestions}</p>
        ) : (
          <>
            <button className="link-btn" onClick={() => onSelect(open.id)}>{open.title}</button>
            <p className="muted small">{open.body && !open.source ? open.body : t.clarifyWhy}</p>
            {deferred === open.id ? (
              <p className="small note">{t.notSureNote}</p>
            ) : (
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!answer.trim()) return;
                  onAnswer(open.id, answer);
                  setAnswer('');
                }}
              >
                <label htmlFor="clarify-answer" className="sr-only">{t.answer}</label>
                <input id="clarify-answer" value={answer} placeholder={t.answerPlaceholder} onChange={(e) => setAnswer(e.target.value)} />
                <div className="row">
                  <button className="btn" type="submit" disabled={!answer.trim()}>{t.answer}</button>
                  <button className="btn ghost" type="button" onClick={() => setDeferred(open.id)}>{t.notSure}</button>
                  <button id="leave-to-agent" className="btn ghost" type="button" onClick={() => onDismiss(open.id)}>{t.leaveToAgent}</button>
                </div>
              </form>
            )}
          </>
        )}
      </div>

      <ul className="concepts">
        {concepts.map((c) => (
          <li key={c.id} className="concept">
            <h3 className="concept-term">{c.term[lang]}</h3>
            <p className="small">{c.plain[lang]}</p>
            <p className="concept-example small">
              <strong>{t.inYourProject}:</strong> {c.example[lang]}
            </p>
          </li>
        ))}
      </ul>
    </aside>
  );
}
