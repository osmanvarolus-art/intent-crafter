// Interpretation providers. Only an offline demo exists: it uses keyword rules,
// not AI, and the UI must say so. A real provider implements the same interface.
import type { Card, CardType } from '../domain/types.ts';

export interface Provider {
  id: string;
  /** false = rule-based demo; the UI shows a "not live AI" banner. */
  live: boolean;
  extract(text: string, revision: number, makeId: () => string, now: string): Card[];
}

// JS \b is ASCII-only, so Turkish letters (ı, ç, ü…) need Unicode-aware boundaries.
const words = (list: string) => new RegExp(`(?<!\\p{L})(${list})(?!\\p{L})`, 'iu');

// Turkish necessity is a suffix (açılmalı, gösterilmeli), negated as -mamalı/-memeli.
const suffix = (re: string) => new RegExp(`\\p{L}(${re})(?!\\p{L})`, 'iu');

const RULES: Array<[CardType, RegExp]> = [
  ['question', /\?\s*$/u],
  ['question', words('mi|mı|mu|mü|misin|mısın|musun|müsün|midir|mıdır')],
  ['question', /^\s*(hangi|neden|niçin|niye|kaç)(?!\p{L})/iu],
  ['option', words('belki|olabilir|ya da|veya|maybe|perhaps|could|or')],
  ['constraint', words('kalsın|asla|sadece|yalnızca|olmamalı|olmasın|zorunda|zorunlu|hariç|gizli|gizlilik|maskele|şifrele|never|only|must|must not|should not|required|mandatory|no|not|without|redact|mask|private|privacy|secret|encrypt|anonymi[sz]e')],
  // Turkish "must not" request mood (gitmesin, görünmesin, çevrilmesin): a rule, not a wish.
  ['constraint', suffix('m[ae]s[ıi]n|m[ae]s[ıi]nlar|m[ae]s[ıi]nler')],
  ['constraint', suffix('mamalı|memeli|mamalıdır|memelidir')],
  ['need', words('istiyorum|gerek|lazım|ihtiyaç|göstersin|want|need|should')],
  ['need', suffix('malı|meli|malıdır|melidir')],
  // Turkish request mood (olsun, çevirsin, eklesin): at least three letters before it, so "kesin" stays an idea.
  ['need', /(?:\p{L}{3,}(?:s[ıiuü]n|s[ıiuü]nlar|s[ıiuü]nler)|(?<!\p{L})olsun(?:lar)?)(?!\p{L})/iu],
];

export const classify = (sentence: string): CardType => RULES.find(([, re]) => re.test(sentence))?.[0] ?? 'idea';

/** Clause spans with exact UTF-16 offsets, whitespace excluded. Splits at sentence-ending . ! ? newline and ama/fakat/but. */
export function sentenceSpans(text: string): Array<{ start: number; end: number; quote: string }> {
  const spans = [];
  // A "." inside a token (2.0, example.com, e.g) or right after a short abbreviation does not end a clause.
  const clause = /(?:[^.!?\n]|\.(?=[^\s.!?])|(?<=(?<!\p{L})(?:e\.g|i\.e|etc|vs|örn|vb|bkz|dr|mr|mrs|ms))\.)+[.!?]*/giu;
  for (const m of text.matchAll(clause)) {
    let offset = m.index;
    // Odd entries are the captured separators; they advance the offset but are not quoted.
    for (const [i, part] of m[0].split(/(\s+(?:ama|fakat|but)\s+)/iu).entries()) {
      const lead = part.length - part.trimStart().length;
      const quote = part.trim();
      if (i % 2 === 0 && quote.length >= 3) spans.push({ start: offset + lead, end: offset + lead + quote.length, quote });
      offset += part.length;
    }
  }
  return spans;
}

/** "Format? TXT mi? MD mi?": short follow-up questions belong to the question before them (one contiguous quote). */
function joinQuestionTails(text: string, spans: Array<{ start: number; end: number; quote: string }>) {
  const out: typeof spans = [];
  for (const s of spans) {
    const prev = out[out.length - 1];
    const short = s.quote.split(/\s+/).length <= 3;
    if (prev && short && prev.quote.endsWith('?') && s.quote.endsWith('?') && /^\s*$/.test(text.slice(prev.end, s.start))) {
      out[out.length - 1] = { start: prev.start, end: s.end, quote: text.slice(prev.start, s.end) };
    } else out.push(s);
  }
  return out;
}

export const demoProvider: Provider = {
  id: 'demo-rules',
  live: false,
  extract(text, revision, makeId, now) {
    return joinQuestionTails(text, sentenceSpans(text)).map(({ start, end, quote }) => ({
      id: makeId(),
      type: classify(quote),
      title: quote,
      body: quote,
      origin: 'ai',
      approval: 'suggested',
      freshness: 'current',
      source: { revision, start, end, quote },
      revision: 1,
      history: [{ at: now, action: 'suggested by demo rules' }],
    }));
  },
};
