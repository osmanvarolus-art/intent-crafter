import { useMemo, useState } from 'react';
import type { Card, CardType } from '../domain/types.ts';
import { useT } from '../i18n.ts';
import { CardView, type CardActions } from './CardView.tsx';

type Filter = 'all' | 'decisions' | CardType;
const TYPES: CardType[] = ['idea', 'need', 'option', 'constraint', 'question'];

export function Board({ cards, selectedId, actions }: { cards: Card[]; selectedId?: string; actions: CardActions }) {
  const { t } = useT();
  const [filter, setFilter] = useState<Filter>('all');
  const counts = useMemo(() => {
    const n: Record<string, number> = { all: cards.length, decisions: 0 };
    for (const c of cards) {
      n[c.type] = (n[c.type] ?? 0) + 1;
      if (c.approval === 'confirmed') n.decisions++;
    }
    return n;
  }, [cards]);
  const count = (f: Filter) => counts[f] ?? 0;
  const shown = cards.filter((c) => filter === 'all' || (filter === 'decisions' ? c.approval === 'confirmed' : c.type === filter));
  const label = (f: Filter) => (f === 'all' ? t.all : f === 'decisions' ? t.decisions : t.type[f]);

  return (
    <section className="panel" aria-labelledby="board-h">
      <div className="panel-head">
        <h2 id="board-h">{t.boardTitle}</h2>
      </div>
      <div className="chips" role="group" aria-label={t.boardTitle}>
        {(['all', ...TYPES, 'decisions'] as Filter[]).map((f) => (
          <button
            key={f}
            id={`filter-${f}`}
            className={`chip chip-${f}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {label(f)} <span className="chip-count">{count(f)}</span>
          </button>
        ))}
      </div>
      <div className="card-list">
        {!cards.length && <p className="empty">{t.emptyBoard}</p>}
        {!!cards.length && !shown.length && <p className="empty">{t.emptyFilter}</p>}
        {shown.map((c) => (
          // key includes revision so local edit state resets after an accepted edit
          <CardView key={`${c.id}-${c.revision}`} card={c} selected={c.id === selectedId} actions={actions} />
        ))}
      </div>
    </section>
  );
}
