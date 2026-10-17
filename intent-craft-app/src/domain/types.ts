// Domain model. Origin, approval and freshness are deliberately separate axes:
// - origin: who first produced the card (never changes after creation)
// - approval: what the user decided about it
// - freshness: whether its inputs changed since it was last reviewed

export type CardType = 'idea' | 'need' | 'option' | 'constraint' | 'question';
export type Origin = 'ai' | 'user';
export type Approval = 'suggested' | 'confirmed' | 'rejected';
export type Freshness = 'current' | 'needs_review';

/** Exact link to the source text that produced a card (UTF-16 offsets). */
export interface SourceRef {
  revision: number;
  start: number;
  end: number;
  quote: string;
}

export interface HistoryEntry {
  at: string;
  action: string;
}

export interface Card {
  id: string;
  type: CardType;
  title: string;
  body: string;
  origin: Origin;
  approval: Approval;
  freshness: Freshness;
  staleReason?: string;
  source?: SourceRef;
  /** Only for question cards: the user's answer. */
  answer?: string;
  revision: number;
  history: HistoryEntry[];
}

export type EvidenceStatus = 'reported' | 'verified' | 'disputed';

/** A claim reported by the coding agent. Never verified until the user says so. */
export interface Evidence {
  id: string;
  claim: string;
  status: EvidenceStatus;
}

export interface TaskPackage {
  createdAt: string;
  /** card id -> revision at the time the package was prepared */
  cardRevisions: Record<string, number>;
  markdown: string;
}

/** The coding agent's pre-check: questions it would otherwise have to guess. */
export interface Precheck {
  at: string;
  sourceRevision: number;
  /** Which model answered (local model id or "claude"). */
  engine: string;
  questions: number;
}

export interface Workspace {
  schema: 1;
  sourceText: string;
  sourceRevision: number;
  cards: Card[];
  pkg?: TaskPackage;
  evidence: Evidence[];
  precheck?: Precheck;
}

export interface ReadinessCheck {
  id: 'has_confirmed' | 'confirmed_current' | 'questions_answered' | 'quotes_valid' | 'agent_precheck';
  ok: boolean;
  /** Number of items that fail the check (0 when ok). */
  failing: number;
}
