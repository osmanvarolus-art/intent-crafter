import { useState } from 'react';
import type { Card } from '../domain/types.ts';
import { useT } from '../i18n.ts';
import { Icon } from './Icon.tsx';

const SHOWN = 3;
/** First letter upper case by the interface language's rules (Turkish i -> İ). */
const sentence = (s: string, lang: string) => s.charAt(0).toLocaleUpperCase(lang) + s.slice(1);

function Question({ card, onAnswer, onLeave, onReopen, onSelect }: {
  card: Card;
  onAnswer: (id: string, answer: string) => void;
  onLeave: (id: string) => void;
  onReopen: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const { t, lang } = useT();
  const [answer, setAnswer] = useState(card.answer ?? '');
  const [changing, setChanging] = useState(false);
  const left = card.approval === 'rejected' && !card.answer;
  const done = (!!card.answer && !changing) || left;
  const fid = `q-${card.id}`;

  return (
    <li className={`question ${done ? 'is-done' : 'is-open'}`} data-card-id={card.id}>
      <label htmlFor={fid} className="question-text">
        {card.source ? <button type="button" className="link-btn" onClick={() => onSelect(card.id)}>{sentence(card.title, lang)}</button> : sentence(card.title, lang)}
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
          <button className="btn" type="submit" disabled={!answer.trim()}>{t.answer}</button>
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
  precheck: { running: boolean; message?: string; error?: boolean; detail?: string };
  precheckDone: boolean;
  precheckStale: boolean;
  onNext: () => void;
}) {
  const { t } = useT();
  const questions = cards.filter((c) => c.type === 'question');
  const isOpen = (c: Card) => !c.answer && c.approval !== 'rejected';
  const open = questions.filter(isOpen);
  const [all, setAll] = useState(false);
  // A few at a time: the rest wait behind "show more" so each one gets a real answer.
  const shown = all ? open : open.slice(0, SHOWN);
  const ordered = [...shown, ...questions.filter((c) => !isOpen(c))];

  return (
    <div className="step-body">
      <div className="step-head">
        <p>{t.stepQuestionsIntro}</p>
        <button id="precheck" className={`btn ${precheckDone && !precheckStale ? 'ghost' : 'primary'}`} onClick={onPrecheck} disabled={precheck.running}>
          {precheckDone && <Icon name="refresh" />} {precheck.running ? t.precheckRunning : precheckDone ? t.askAgain : t.precheck}
        </button>
      </div>
      {precheck.message && (
        <p id="precheck-status" className={`small ${precheck.error ? 'voice-error' : 'muted'}`} role="status" title={precheck.detail}>{precheck.message}</p>
      )}
      {precheckStale && !precheck.running && <p className="small note">{t.precheckStale}</p>}
      {!ordered.length && !precheck.running && <p className="empty">{t.noOpenQuestions}</p>}
      <ol className="questions">
        {ordered.map((c) => (
          <Question key={`${c.id}-${c.revision}`} card={c} onAnswer={onAnswer} onLeave={onLeave} onReopen={onReopen} onSelect={onSelect} />
        ))}
      </ol>
      {open.length > shown.length && (
        <button id="more-questions" className="btn ghost" onClick={() => setAll(true)}>{t.moreQuestions(open.length - shown.length)}</button>
      )}
      <div className="step-foot">
        <button id="next-task" className={`btn ${open.length ? 'ghost' : 'primary'}`} onClick={onNext}>
          {open.length ? t.skipTo : t.next}: {t.steps.task} <Icon name="arrow" size={14} />
        </button>
      </div>
    </div>
  );
}
