import { useState } from 'react';
import type { Card } from '../domain/types.ts';
import { useT } from '../i18n.ts';

function Question({ card, onAnswer, onLeave, onReopen, onSelect }: {
  card: Card;
  onAnswer: (id: string, answer: string) => void;
  onLeave: (id: string) => void;
  onReopen: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const { t } = useT();
  const [answer, setAnswer] = useState(card.answer ?? '');
  const [changing, setChanging] = useState(false);
  const left = card.approval === 'rejected' && !card.answer;
  const done = (!!card.answer && !changing) || left;
  const fid = `q-${card.id}`;

  return (
    <li className={`question ${done ? 'is-done' : 'is-open'}`} data-card-id={card.id}>
      <label htmlFor={fid} className="question-text">
        {card.source ? <button type="button" className="link-btn" onClick={() => onSelect(card.id)}>{card.title}</button> : card.title}
      </label>
      {card.body && !card.source && <p className="muted small">{card.body}</p>}
      {left ? (
        <p className="row small muted">
          {t.leftToAgentLabel}
          <button className="btn ghost" onClick={() => onReopen(card.id)}>{t.undoChoice}</button>
        </p>
      ) : done ? (
        <p className="row answer">
          <span className="grow">{card.answer}</span>
          <button className="btn ghost" onClick={() => setChanging(true)}>{t.change}</button>
        </p>
      ) : (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!answer.trim()) return;
            onAnswer(card.id, answer);
            setChanging(false);
          }}
        >
          <input id={fid} className="grow answer-input" value={answer} placeholder={t.answerPlaceholder} onChange={(e) => setAnswer(e.target.value)} />
          <button className="btn primary" type="submit" disabled={!answer.trim()}>{t.answer}</button>
          <button className="btn ghost leave" type="button" onClick={() => onLeave(card.id)}>{t.leaveToAgent}</button>
        </form>
      )}
    </li>
  );
}

export function QuestionsStep({ cards, onAnswer, onLeave, onReopen, onSelect, onPrecheck, precheck, precheckDone, precheckStale, onNext }: {
  cards: Card[];
  onAnswer: (id: string, answer: string) => void;
  onLeave: (id: string) => void;
  onReopen: (id: string) => void;
  onSelect: (id: string) => void;
  onPrecheck: () => void;
  precheck: { running: boolean; message?: string; error?: boolean };
  precheckDone: boolean;
  precheckStale: boolean;
  onNext: () => void;
}) {
  const { t } = useT();
  const questions = cards.filter((c) => c.type === 'question');
  const isOpen = (c: Card) => !c.answer && c.approval !== 'rejected';
  const ordered = [...questions.filter(isOpen), ...questions.filter((c) => !isOpen(c))];

  return (
    <div className="step-body">
      <div className="step-head">
        <p>{t.stepQuestionsIntro}</p>
        <button id="precheck" className={`btn ${precheckDone && !precheckStale ? '' : 'primary'}`} onClick={onPrecheck} disabled={precheck.running}>
          {precheck.running ? t.precheckRunning : precheckDone ? t.askAgain : t.precheck}
        </button>
      </div>
      {precheck.message && (
        <p id="precheck-status" className={`small ${precheck.error ? 'voice-error' : 'muted'}`} role="status">{precheck.message}</p>
      )}
      {precheckStale && !precheck.running && <p className="small note">{t.precheckStale}</p>}
      {!ordered.length && !precheck.running && <p className="empty">{t.noOpenQuestions}</p>}
      <ol className="questions">
        {ordered.map((c) => (
          <Question key={`${c.id}-${c.revision}`} card={c} onAnswer={onAnswer} onLeave={onLeave} onReopen={onReopen} onSelect={onSelect} />
        ))}
      </ol>
      <div className="step-foot">
        <button id="next-task" className="btn primary" onClick={onNext}>{t.next}: {t.steps.task} →</button>
      </div>
    </div>
  );
}
