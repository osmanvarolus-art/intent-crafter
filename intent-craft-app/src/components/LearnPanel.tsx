import { useState } from 'react';
import type { Card } from '../domain/types.ts';
import { useT } from '../i18n.ts';
import { relevantConcepts } from '../providers/glossary.ts';

export function LearnPanel({ text, cards, onAnswer, onSelect }: {
  text: string;
  cards: Card[];
  onAnswer: (id: string, answer: string) => void;
  onSelect: (id: string) => void;
}) {
  const { t, lang } = useT();
  const concepts = relevantConcepts(text, new Set(cards.map((c) => c.type)));
  const open = cards.find((c) => c.type === 'question' && c.approval !== 'rejected' && !c.answer);
  const [answer, setAnswer] = useState('');
  const [deferred, setDeferred] = useState<string | null>(null);

  return (
    <aside className="panel" aria-labelledby="learn-h">
      <div className="panel-head">
        <h2 id="learn-h">{t.learnTitle}</h2>
        <p className="muted small">{t.learnHint}</p>
      </div>

      <div className="clarify" aria-labelledby="clarify-h">
        <h3 id="clarify-h" className="eyebrow">{t.clarifyTitle}</h3>
        {!open ? (
          <p className="muted small">{t.noQuestions}</p>
        ) : (
          <>
            <button className="link-btn" onClick={() => onSelect(open.id)}>{open.title}</button>
            <p className="muted small">{t.clarifyWhy}</p>
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
