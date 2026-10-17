// The coding agent's pre-check: read the draft task and list what it would otherwise have to guess.
// Runs on this machine: local models through llama-swap first, the Claude CLI (subscription) last.
import { askChain, extractJson, ENGINES, type Asker } from './llm.ts';

export interface Question {
  q: string;
  why: string;
}

export interface PrecheckResult {
  engine: string;
  questions: Question[];
}

const MAX_QUESTIONS = 6;

export function buildPrompt(draft: string, lang: 'tr' | 'en'): string {
  const language = lang === 'tr' ? 'Turkish' : 'English';
  return [
    'You are the coding agent who will receive the task below from a non-programmer.',
    'Before writing any code, list the questions you would have to ask, because otherwise you would have to guess.',
    `Only questions whose answer changes what you build or how; at most ${MAX_QUESTIONS}; most important first.`,
    'Do not ask about anything the task already answers. Do not ask about the user\'s hardware or tools you can look up yourself.',
    `Write each question in plain words a non-programmer understands, in ${language}, with a one-sentence reason.`,
    'Reply with JSON only: {"questions":[{"q":"...","why":"..."}]}',
    '',
    'TASK:',
    draft,
  ].join('\n');
}

/** Model text -> questions. Tolerates code fences and text around the JSON; drops malformed entries. */
export function parseQuestions(text: string): Question[] {
  const list = (extractJson(text) as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) return [];
  return list
    .filter((x): x is { q: string; why?: unknown } => typeof x === 'object' && x !== null && typeof (x as { q?: unknown }).q === 'string')
    .map((x) => ({ q: x.q.trim(), why: typeof x.why === 'string' ? x.why.trim() : '' }))
    .filter((x) => x.q.length > 3)
    .slice(0, MAX_QUESTIONS);
}

/** Ask the engines in order; the first that returns parseable questions (or an explicit empty list) wins. */
export async function runPrecheck(draft: string, lang: 'tr' | 'en', ask?: Asker, engines = ENGINES): Promise<PrecheckResult> {
  const parse = (text: string) => {
    const qs = parseQuestions(text);
    return qs.length || /"questions"\s*:\s*\[\s*\]/.test(text) ? qs : null;
  };
  const { engine, value } = await askChain(buildPrompt(draft, lang), parse, ask, engines);
  return { engine, questions: value };
}
