// Pure domain rules. No React, no storage, no clock: callers pass `now`.
import type { Card, Evidence, ReadinessCheck, SourceRef, TaskPackage, Workspace } from './types.ts';

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
  history: [...card.history, { at: now, action }],
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
  return {
    ...ws,
    sourceText: text,
    sourceRevision: ws.sourceRevision + 1,
    cards: ws.cards.map((c) => {
      if (!c.source || c.freshness === 'needs_review' || quoteIsValid(text, c.source)) return c;
      // An edit elsewhere only shifted the offsets: the exact quote is still there, once. Follow it.
      const start = text.indexOf(c.source.quote);
      if (start >= 0 && text.indexOf(c.source.quote, start + 1) < 0) {
        return { ...c, source: { ...c.source, start, end: start + c.source.quote.length, revision: ws.sourceRevision + 1 } };
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
  const keptQuotes = new Set(kept.map((c) => c.source?.quote));
  return { ...ws, cards: [...kept, ...incoming.filter((c) => !keptQuotes.has(c.source?.quote))] };
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
  ];
}

/** Deterministic: same workspace -> same markdown. Task text is English for the agent. */
export function buildMarkdown(ws: Workspace): string {
  const decisions = ws.cards.filter((c) => isDecision(c) && c.freshness === 'current');
  const openOptions = ws.cards.filter((c) => c.type === 'option' && c.approval === 'suggested');
  const answered = ws.cards.filter((c) => c.type === 'question' && c.answer);
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
      ? decisions.map((c) => `- [${c.id} r${c.revision}] (${c.type}, origin: ${c.origin}) **${c.title}**${c.body && c.body !== c.title ? `: ${c.body}` : ''}${quote(c)}`)
      : ['- None yet.']),
    '',
    '## Clarifications',
    '',
    ...(answered.length ? answered.map((c) => `- Q: ${c.title}\n  - A: ${c.answer}`) : ['- None.']),
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
export function isWorkspace(v: unknown): v is Workspace {
  const w = v as Workspace;
  return !!w && w.schema === 1 && typeof w.sourceText === 'string' && Array.isArray(w.cards) && Array.isArray(w.evidence);
}
