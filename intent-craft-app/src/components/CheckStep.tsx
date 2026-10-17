import { memo, useState } from 'react';
import type { Card } from '../domain/types.ts';
import { useT } from '../i18n.ts';

const norm = (s: string) => s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export interface PointActions {
  select: (id: string) => void;
  confirm: (id: string) => void;
  reject: (id: string) => void;
  reopen: (id: string) => void;
  reviewed: (id: string) => void;
  edit: (id: string, patch: { title: string; body: string }) => void;
}

/** One understood sentence: its kind, the sentence once, and keep / drop. */
const Point = memo(function Point({ card, selected, actions }: { card: Card; selected: boolean; actions: PointActions }) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(card.body || card.title);
  const stale = card.freshness === 'needs_review';
  const sentence = card.body || card.title;

  return (
    <li className={`point is-${card.approval} ${stale ? 'is-stale' : ''} ${selected ? 'is-selected' : ''}`} data-card-id={card.id}>
      <span className={`kind type-${card.type}`} title={t.typeHelp[card.type]}>{t.type[card.type]}</span>
      {editing ? (
        <form
          className="point-edit"
          onSubmit={(e) => {
            e.preventDefault();
            const v = text.trim();
            if (v) actions.edit(card.id, { title: v, body: v });
            setEditing(false);
          }}
        >
          <textarea value={text} rows={Math.min(6, Math.ceil(text.length / 70) + 1)} onChange={(e) => setText(e.target.value)} autoFocus aria-label={t.edit} />
          <button className="btn primary" type="submit">{t.save}</button>
          <button className="btn ghost" type="button" onClick={() => setEditing(false)}>{t.cancel}</button>
        </form>
      ) : (
        <button className="point-text" onClick={() => actions.select(card.id)} aria-pressed={selected}>
          {sentence}
          {card.source && norm(card.source.quote) !== norm(sentence) && <span className="point-quote">“{card.source.quote}”</span>}
          {!card.source && <span className="point-quote">{t.noQuote}</span>}
          {stale && <span className="point-stale">{t.changedText}</span>}
        </button>
      )}
      {!editing && (
        <span className="point-actions">
          {stale && <button className="btn" onClick={() => actions.reviewed(card.id)}>{t.reviewed}</button>}
          {card.approval === 'suggested' ? (
            <>
              <button className="btn confirm" onClick={() => actions.confirm(card.id)}>✓ {t.keep}</button>
              <button className="btn ghost" onClick={() => actions.reject(card.id)}>✕ {t.drop}</button>
            </>
          ) : (
            <>
              <span className={`point-state is-${card.approval}`}>{card.approval === 'confirmed' ? `✓ ${t.kept}` : t.dropped}</span>
              <button className="btn ghost" onClick={() => actions.reopen(card.id)}>{t.undoChoice}</button>
            </>
          )}
          <button className="btn ghost icon" onClick={() => setEditing(true)} aria-label={t.edit} title={t.edit}>✎</button>
        </span>
      )}
    </li>
  );
});

export function CheckStep({ cards, selectedId, actions, onNext, split, onStartOver }: {
  cards: Card[];
  selectedId?: string;
  actions: PointActions;
  onNext: () => void;
  split: { running: boolean; engine?: string; error?: string };
  /** The old decisions no longer match the text: start a new idea with the current text. */
  onStartOver: () => void;
}) {
  const { t } = useT();
  const points = cards.filter((c) => c.type !== 'question');
  const open = points.filter((c) => c.approval === 'suggested' && c.type !== 'option');
  const decisions = points.filter((c) => c.approval === 'confirmed');
  const allStale = decisions.length > 0 && decisions.every((c) => c.freshness === 'needs_review');
  if (split.running && !points.length) return <p className="empty" role="status">{t.splitting}</p>;
  if (!points.length) return <p className="empty">{t.nothingToCheck}</p>;
  return (
    <div className="step-body">
      <div className="step-head">
        <p>{t.stepCheckIntro}</p>
        {open.length > 1 && (
          <button id="keep-all" className="btn" onClick={() => open.forEach((c) => actions.confirm(c.id))}>
            ✓ {t.keepAll} ({open.length})
          </button>
        )}
      </div>
      {allStale && (
        <div className="missing" role="status">
          <p>{t.looksNew}</p>
          <div><button id="start-over" className="btn primary" onClick={onStartOver}>{t.startOverWithText}</button></div>
        </div>
      )}
      {split.running && <p className="small muted" role="status">{t.splitting}</p>}
      <ul className="points">
        {points.map((c) => (
          // key includes revision so the edit field resets after a saved edit
          <Point key={`${c.id}-${c.revision}`} card={c} selected={c.id === selectedId} actions={actions} />
        ))}
      </ul>
      <p className="muted small">
        {split.engine && split.engine !== 'rules' ? t.splitByModel(split.engine) : t.stepCheckRuleNote}
        {split.error && ` (${split.error})`}
      </p>
      <div className="step-foot">
        <button id="next-questions" className="btn primary" onClick={onNext}>{t.next}: {t.steps.questions} →</button>
      </div>
    </div>
  );
}
