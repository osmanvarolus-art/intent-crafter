// Points written by a language model (server/extract.ts), tied back to the user's exact words.
import type { Card, CardType, SourceRef } from '../domain/types.ts';

export interface ModelItem {
  type: CardType;
  text: string;
  quote: string;
}

/** Letters and digits only, lower case, single spaces; `map[i]` is the original index of out[i]. */
function fold(s: string): { out: string; map: number[] } {
  let out = '';
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i].toLowerCase()[0]; // first char only: "İ" lower-cases to two characters
    if (/[\p{L}\p{N}]/u.test(ch)) {
      out += ch;
      map.push(i);
    } else if (out && !out.endsWith(' ')) {
      out += ' ';
      map.push(i);
    }
  }
  return { out, map };
}

/**
 * Where the quote sits in the thought. Exact match first; then the same words ignoring case, spacing and
 * punctuation (the link then points at the user's own text). Not found: no link, never a guess.
 */
export function locate(text: string, quote: string, revision: number): SourceRef | undefined {
  if (!quote) return undefined;
  const at = text.indexOf(quote);
  if (at >= 0) return text.indexOf(quote, at + 1) < 0 ? { revision, start: at, end: at + quote.length, quote } : undefined;
  const q = fold(quote).out.trim();
  if (q.length < 4) return undefined;
  const { out, map } = fold(text);
  const i = out.indexOf(q);
  if (i < 0 || out.indexOf(q, i + 1) >= 0) return undefined; // missing or ambiguous
  const start = map[i];
  const end = map[i + q.length - 1] + 1;
  return { revision, start, end, quote: text.slice(start, end) };
}

// Privacy and security rules are limits, whatever the model called them.
const PRIVACY = /redact|mask|anonymi[sz]|encrypt|personal data|secret|password|api key|token|privacy|confidential|gizli|kişisel veri|şifre|maskele|dışarı gitme|paylaşılma|gizlilik/iu;

/** What the user asked stays a question: a model may not turn "can it work offline?" into a decision. */
const kind = (it: ModelItem, source?: SourceRef): ModelItem['type'] => {
  const said = (source?.quote ?? it.quote).trim();
  if (said.endsWith('?')) return 'question';
  if ((it.type === 'need' || it.type === 'idea') && PRIVACY.test(`${it.text} ${it.quote}`)) return 'constraint';
  return it.type;
};

export function cardsFromItems(text: string, items: ModelItem[], revision: number, makeId: () => string, now: string, engine: string): Card[] {
  return items.map((it) => {
    const source = locate(text, it.quote, revision);
    // The quote a model returns can drop the "?"; look at the user's own words right after it.
    const asked = source && text.slice(source.end).match(/^\s*\?/) ? { ...source, end: source.end + text.slice(source.end).indexOf('?') + 1 } : source;
    const linked = asked && asked !== source ? { ...asked, quote: text.slice(asked.start, asked.end) } : source;
    const type = kind(it, linked);
    // A question the user asked is shown in the user's own words (models tend to rewrite it as a statement).
    const wording = type === 'question' && linked?.quote.trim().endsWith('?') ? linked.quote : it.text;
    return {
      id: makeId(),
      type,
      title: wording,
      body: wording,
      origin: 'ai' as const,
      approval: 'suggested' as const,
      freshness: 'current' as const,
      source: linked,
      revision: 1,
      history: [{ at: now, action: `suggested by ${engine}` }],
    };
  });
}
