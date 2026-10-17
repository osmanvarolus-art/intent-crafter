import { memo, useState } from 'react';
import type { Card } from '../domain/types.ts';
import { useT } from '../i18n.ts';

export interface CardActions {
  select: (id: string) => void;
  confirm: (id: string) => void;
  reject: (id: string) => void;
  reopen: (id: string) => void;
  reviewed: (id: string) => void;
  edit: (id: string, patch: { title: string; body: string }) => void;
  answer: (id: string, answer: string) => void;
}

// Memoized: typing in the thought box changes no card object, so unchanged cards skip rendering.
export const CardView = memo(function CardView({ card, selected, actions }: { card: Card; selected: boolean; actions: CardActions }) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [body, setBody] = useState(card.body);
  const [answer, setAnswer] = useState(card.answer ?? '');
  const stale = card.freshness === 'needs_review';
  const isQuestion = card.type === 'question';
  const fid = (s: string) => `${s}-${card.id}`;

  return (
    <article
      className={`card approval-${card.approval} ${stale ? 'is-stale' : ''} ${selected ? 'is-selected' : ''}`}
      aria-labelledby={fid('title')}
      data-card-id={card.id}
    >
      <div className="badges">
        <span className={`badge type type-${card.type}`}>{t.type[card.type]}</span>
        <span className={`badge origin-${card.origin}`}>
          {card.origin === 'ai' && card.approval === 'confirmed' ? t.originAiConfirmed : t.origin[card.origin]}
        </span>
        {!isQuestion && <span className={`badge approval approval-${card.approval}`}>{t.approval[card.approval]}</span>}
        <span className={`badge fresh-${card.freshness}`}>{t.freshness[card.freshness]}</span>
      </div>

      {editing ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            actions.edit(card.id, { title: title.trim() || card.title, body: body.trim() });
            setEditing(false);
          }}
        >
          <label className="small" htmlFor={fid('et')}>{t.titleLabel}</label>
          <input id={fid('et')} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <label className="small" htmlFor={fid('eb')}>{t.bodyLabel}</label>
          <textarea id={fid('eb')} value={body} rows={3} onChange={(e) => setBody(e.target.value)} />
          <div className="row">
            <button className="btn primary" type="submit">{t.save}</button>
            <button className="btn ghost" type="button" onClick={() => setEditing(false)}>{t.cancel}</button>
          </div>
        </form>
      ) : (
        <>
          <h3 id={fid('title')} className="card-title">{card.title}</h3>
          {card.body && card.body !== card.title && <p className="card-body">{card.body}</p>}
        </>
      )}

      {stale && card.staleReason === 'source_changed' && <p className="stale-note small" role="status">{t.staleSource}</p>}

      {card.source ? (
        <button id={fid('quote')} className="quote" onClick={() => actions.select(card.id)} aria-pressed={selected}>
          <span className="eyebrow">{t.quote} · {card.source.start}–{card.source.end}</span>
          <span className="quote-text">“{card.source.quote}”</span>
        </button>
      ) : (
        <p className="muted small">{t.noQuote}</p>
      )}

      {isQuestion && (
        card.answer ? (
          <p className="answer small"><strong>{t.answered}:</strong> {card.answer}</p>
        ) : (
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (answer.trim()) actions.answer(card.id, answer); }}>
            <label htmlFor={fid('ans')} className="sr-only">{t.answer}</label>
            <input id={fid('ans')} className="grow" value={answer} placeholder={t.answerPlaceholder} onChange={(e) => setAnswer(e.target.value)} />
            <button className="btn" type="submit" disabled={!answer.trim()}>{t.answer}</button>
          </form>
        )
      )}

      <div className="card-actions">
        {!isQuestion && card.approval === 'suggested' && (
          <button id={fid('confirm')} className="btn confirm" onClick={() => actions.confirm(card.id)}>{t.confirm}</button>
        )}
        {stale && <button id={fid('reviewed')} className="btn" onClick={() => actions.reviewed(card.id)}>{t.reviewed}</button>}
        {!editing && !isQuestion && <button id={fid('edit')} className="btn ghost" onClick={() => setEditing(true)}>{t.edit}</button>}
        {card.approval === 'suggested'
          ? <button id={fid('reject')} className="btn ghost" onClick={() => actions.reject(card.id)}>{t.reject}</button>
          : !isQuestion && <button id={fid('reopen')} className="btn ghost" onClick={() => actions.reopen(card.id)}>{t.reopen}</button>}
      </div>
    </article>
  );
});
