// Pure domain rules. No React, no storage, no clock: callers pass `now`.
import type { Card, CardType, Evidence, ReadinessCheck, SourceRef, TaskPackage, Workspace } from './types.ts';

const HISTORY_LIMIT = 50;

export const emptyWorkspace = (): Workspace => ({
  schema: 1,
  sourceText: '',
  sourceRevision: 0,
  cards: [],
  evidence: [],
});

export const quoteIsValid = (text: string, ref: SourceRef): boolean =>
  text.slice(ref.start, ref.end) === ref.quote;

const log = (card: Card, now: string, action: string): Card => ({
  ...card,
  history: [...card.history, { at: now, action }].slice(-HISTORY_LIMIT),
});

const mapCard = (ws: Workspace, id: string, fn: (c: Card) => Card): Workspace => ({
  ...ws,
  cards: ws.cards.map((c) => (c.id === id ? fn(c) : c)),
});

/**
 * New source text. A card whose exact quote moved (an edit elsewhere) follows it; a card whose
 * quote is gone or now ambiguous is marked needs_review. Approval is kept so the history of the decision is not erased.
 */
export function applySourceEdit(ws: Workspace, text: string, now: string): Workspace {
  if (text === ws.sourceText) return ws;
  // One edit region: text before `head` and after the old/new tails is unchanged, so most quotes just shift.
  const old = ws.sourceText;
  let head = 0;
  while (head < old.length && head < text.length && old[head] === text[head]) head++;
  let tail = 0;
  while (tail < old.length - head && tail < text.length - head && old[old.length - 1 - tail] === text[text.length - 1 - tail]) tail++;
  const delta = text.length - old.length;
  const revision = ws.sourceRevision + 1;
  return {
    ...ws,
    sourceText: text,
    sourceRevision: revision,
    cards: ws.cards.map((c) => {
      if (!c.source || c.freshness === 'needs_review') return c;
      const { start, end, quote } = c.source;
      if (end <= head) return c; // entirely before the edit
      if (start >= old.length - tail) {
        const moved = { ...c.source, start: start + delta, end: end + delta, revision };
        return delta ? { ...c, source: moved } : c; // entirely after the edit: shift
      }
      if (quoteIsValid(text, c.source)) return c;
      // The edit touched this quote. If its exact words still occur exactly once, follow them.
      const at = text.indexOf(quote);
      if (at >= 0 && text.indexOf(quote, at + 1) < 0) {
        return { ...c, source: { ...c.source, start: at, end: at + quote.length, revision } };
      }
      return log({ ...c, freshness: 'needs_review', staleReason: 'source_changed' }, now, 'source changed');
    }),
  };
}

/** The only path to a confirmed decision. Origin is preserved. */
export const confirmCard = (ws: Workspace, id: string, now: string): Workspace =>
  mapCard(ws, id, (c) =>
    c.type === 'question' ? c : log({ ...c, approval: 'confirmed' }, now, 'confirmed as decision by user'),
  );

export const rejectCard = (ws: Workspace, id: string, now: string): Workspace =>
  mapCard(ws, id, (c) => log({ ...c, approval: 'rejected' }, now, 'rejected by user'));

export const reopenCard = (ws: Workspace, id: string, now: string): Workspace =>
  mapCard(ws, id, (c) => log({ ...c, approval: 'suggested' }, now, 'reopened by user'));

/** User re-checked a stale card against the current source. */
export function markReviewed(ws: Workspace, id: string, now: string): Workspace {
  return mapCard(ws, id, (c) => {
    let source = c.source;
    if (source && !quoteIsValid(ws.sourceText, source)) {
      // Re-anchor if the quote still exists somewhere; otherwise drop the broken link.
      const start = ws.sourceText.indexOf(source.quote);
      source = start >= 0 ? { ...source, start, end: start + source.quote.length, revision: ws.sourceRevision } : undefined;
    }
    return log({ ...c, source, freshness: 'current', staleReason: undefined }, now, 'reviewed by user');
  });
}

/** User edit. Bumps the revision, so any prepared task package needs review. */
export const editCard = (ws: Workspace, id: string, patch: Pick<Card, 'title' | 'body'>, now: string): Workspace =>
  mapCard(ws, id, (c) => log({ ...c, ...patch, revision: c.revision + 1 }, now, 'edited by user'));

export const answerQuestion = (ws: Workspace, id: string, answer: string, now: string): Workspace =>
  mapCard(ws, id, (c) => log({ ...c, answer: answer.trim() || undefined, revision: c.revision + 1 }, now, 'answered by user'));

/**
 * Merge freshly extracted AI suggestions: keep every card the user touched
 * (confirmed, rejected, edited, answered or user-made), replace untouched suggestions.
 */
export function mergeSuggestions(ws: Workspace, incoming: Card[]): Workspace {
  const kept = ws.cards.filter((c) => c.origin === 'user' || c.approval !== 'suggested' || c.revision > 1 || c.answer);
  const keptQuotes = new Set(kept.map((c) => c.source?.quote).filter(Boolean));
  const keptTitles = new Set(kept.map((c) => c.title.trim().toLowerCase()));
  // A point already decided (same words, or the same rewritten text from a model) is not suggested again.
  return { ...ws, cards: [...kept, ...incoming.filter((c) => !keptQuotes.has(c.source?.quote) && !keptTitles.has(c.title.trim().toLowerCase()))] };
}

export const isDecision = (c: Card) => c.approval === 'confirmed';

export function readiness(ws: Workspace): ReadinessCheck[] {
  const confirmed = ws.cards.filter(isDecision);
  const staleConfirmed = confirmed.filter((c) => c.freshness === 'needs_review').length;
  const openQuestions = ws.cards.filter((c) => c.type === 'question' && c.approval !== 'rejected' && !c.answer).length;
  const brokenQuotes = confirmed.filter((c) => c.source && !quoteIsValid(ws.sourceText, c.source)).length;
  return [
    { id: 'has_confirmed', ok: confirmed.length > 0, failing: confirmed.length > 0 ? 0 : 1 },
    { id: 'confirmed_current', ok: staleConfirmed === 0, failing: staleConfirmed },
    { id: 'questions_answered', ok: openQuestions === 0, failing: openQuestions },
    { id: 'quotes_valid', ok: brokenQuotes === 0, failing: brokenQuotes },
    { id: 'agent_precheck', ok: !!ws.precheck, failing: ws.precheck ? 0 : 1 },
  ];
}

/** Deterministic: same workspace -> same markdown. Task text is English for the agent. */
export function buildMarkdown(ws: Workspace): string {
  const decisions = ws.cards.filter((c) => isDecision(c) && c.freshness === 'current');
  const openOptions = ws.cards.filter((c) => c.type === 'option' && c.approval === 'suggested');
  const answered = ws.cards.filter((c) => c.type === 'question' && c.answer);
  const leftToAgent = ws.cards.filter((c) => c.type === 'question' && !c.answer && c.approval === 'rejected');
  // A demo-rule title is the body cut at 70 characters: print the sentence once.
  const text = (c: Card) =>
    c.body && c.body !== c.title && !(c.title.endsWith('…') && c.body.startsWith(c.title.slice(0, -1))) ? `**${c.title}**: ${c.body}` : `**${c.body || c.title}**`;
  const quote = (c: Card) => (c.source ? `\n  - Source quote [${c.source.start}:${c.source.end}]: "${c.source.quote}"` : '');
  const lines = [
    '# IntentCraft task package',
    '',
    '## Original thought',
    '',
    '> ' + ws.sourceText.trim().replace(/\n+/g, '\n> '),
    '',
    '## Confirmed decisions (mandatory scope)',
    '',
    ...(decisions.length
      ? decisions.map((c) => `- [${c.id} r${c.revision}] (${c.type}, origin: ${c.origin}) ${text(c)}${quote(c)}`)
      : ['- None yet.']),
    '',
    '## Clarifications',
    '',
    ...(answered.length ? answered.map((c) => `- Q: ${c.title}\n  - A: ${c.answer}`) : ['- None.']),
    ...(leftToAgent.length ? ['', 'Left to your judgement (the user chose not to decide; say what you chose):', '', ...leftToAgent.map((c) => `- ${c.title}`)] : []),
    '',
    '## Out of scope (unconfirmed options, do not implement)',
    '',
    ...(openOptions.length ? openOptions.map((c) => `- ${c.title}`) : ['- None.']),
    '',
    '## Rules for the agent',
    '',
    '- Implement only the confirmed decisions above.',
    '- Report evidence for each decision (files changed, commands run, output). The user verifies it.',
    '- Ask instead of guessing when a decision is ambiguous.',
    '',
  ];
  return lines.join('\n');
}

export function preparePackage(ws: Workspace, now: string): Workspace {
  const pkg: TaskPackage = {
    createdAt: now,
    cardRevisions: Object.fromEntries(ws.cards.filter(isDecision).map((c) => [c.id, c.revision])),
    markdown: buildMarkdown(ws),
  };
  return { ...ws, pkg };
}

/** A prepared package needs review when its decisions changed after it was made. */
export function packageStatus(ws: Workspace): 'none' | 'current' | 'needs_review' {
  if (!ws.pkg) return 'none';
  const decisions = ws.cards.filter(isDecision);
  const revs = ws.pkg.cardRevisions;
  const changed =
    decisions.length !== Object.keys(revs).length ||
    decisions.some((c) => revs[c.id] !== c.revision || c.freshness === 'needs_review');
  return changed ? 'needs_review' : 'current';
}

/** Each non-empty line of an agent report becomes one reported (unverified) claim. */
export function addReportedEvidence(ws: Workspace, report: string, makeId: () => string): Workspace {
  const claims: Evidence[] = report
    .split('\n')
    .map((l) => l.replace(/^\s*[-*\d.)]+\s*/, '').trim())
    .filter(Boolean)
    .map((claim) => ({ id: makeId(), claim, status: 'reported' }));
  return { ...ws, evidence: [...ws.evidence, ...claims] };
}

export const setEvidenceStatus = (ws: Workspace, id: string, status: Evidence['status']): Workspace => ({
  ...ws,
  evidence: ws.evidence.map((e) => (e.id === id ? { ...e, status } : e)),
});

/** Trust boundary for persisted data: accept only the shape we wrote. */
const CARD_TYPES: CardType[] = ['idea', 'need', 'option', 'constraint', 'question'];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

function isCard(v: unknown): v is Card {
  if (!isObj(v)) return false;
  const s = v.source;
  return isStr(v.id) && CARD_TYPES.includes(v.type as CardType) && isStr(v.title) && isStr(v.body) &&
    (v.origin === 'ai' || v.origin === 'user') && ['suggested', 'confirmed', 'rejected'].includes(v.approval as string) &&
    (v.freshness === 'current' || v.freshness === 'needs_review') && isInt(v.revision) && Array.isArray(v.history) &&
    (v.answer === undefined || isStr(v.answer)) &&
    (s === undefined || (isObj(s) && isInt(s.start) && isInt(s.end) && (s.end as number) >= (s.start as number) && isStr(s.quote) && isInt(s.revision)));
}

const isEvidence = (v: unknown): v is Evidence =>
  isObj(v) && isStr(v.id) && isStr(v.claim) && ['reported', 'verified', 'disputed'].includes(v.status as string);

/**
 * Stored data -> a workspace the UI can render, or null when the shape is unusable.
 * Damaged cards or claims are dropped one by one instead of losing the whole workspace.
 */
export function sanitizeWorkspace(v: unknown): Workspace | null {
  if (!isObj(v) || v.schema !== 1 || !isStr(v.sourceText) || !Array.isArray(v.cards) || !Array.isArray(v.evidence)) return null;
  const pkg = isObj(v.pkg) && isStr(v.pkg.markdown) && isStr(v.pkg.createdAt) && isObj(v.pkg.cardRevisions) ? (v.pkg as unknown as TaskPackage) : undefined;
  const pc = v.precheck;
  const precheck = isObj(pc) && isStr(pc.at) && isInt(pc.sourceRevision) && isStr(pc.engine) && isInt(pc.questions)
    ? (pc as unknown as Workspace['precheck']) : undefined;
  return {
    schema: 1,
    sourceText: v.sourceText,
    sourceRevision: isInt(v.sourceRevision) ? v.sourceRevision : 0,
    cards: v.cards.filter(isCard),
    evidence: v.evidence.filter(isEvidence),
    ...(pkg && { pkg }),
    ...(precheck && { precheck }),
  };
}

export const isWorkspace = (v: unknown): v is Workspace => {
  const w = sanitizeWorkspace(v);
  return !!w && w.cards.length === (v as Workspace).cards.length && w.evidence.length === (v as Workspace).evidence.length;
};

/** Word stems (first 5 letters of each word of 3+ letters): "formatta" and "formatı" count as the same word. */
const words = (s: string) => new Set((s.toLocaleLowerCase().match(/\p{L}{3,}|\p{N}+/gu) ?? []).map((w) => w.slice(0, 5)));

/** Two questions are the same when most of the shorter one's words are in the other (and it has a few words). */
function sameQuestion(a: Set<string>, b: Set<string>): boolean {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if (!small.size) return true;
  let shared = 0;
  for (const w of small) if (big.has(w)) shared++;
  return small.size < 3 ? shared === small.size : shared / small.size >= 0.6;
}

/**
 * Questions from the coding agent's pre-check become question cards (origin ai, no source quote).
 * A question already on the board (same wording) is not added twice.
 */
export function addPrecheck(
  ws: Workspace,
  questions: Array<{ q: string; why?: string }>,
  engine: string,
  makeId: () => string,
  now: string,
): Workspace {
  const seen = ws.cards.filter((c) => c.type === 'question').map((c) => words(c.title));
  const cards: Card[] = [];
  for (const { q, why } of questions) {
    const title = q.trim();
    const w = words(title);
    if (!title || seen.some((s) => sameQuestion(s, w))) continue;
    seen.push(w);
    cards.push({
      id: makeId(), type: 'question', title, body: (why ?? '').trim(), origin: 'ai', approval: 'suggested',
      freshness: 'current', revision: 1, history: [{ at: now, action: 'asked by the coding agent pre-check' }],
    });
  }
  return {
    ...ws,
    cards: [...ws.cards, ...cards],
    precheck: { at: now, sourceRevision: ws.sourceRevision, engine, questions: cards.length },
  };
}
