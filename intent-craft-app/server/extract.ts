// Turn a spoken or written thought into clear project points: goal, needs, constraints, options, open questions.
// Each point carries the user's exact words, so the app can show where it came from.
import { askChain, extractJson, ENGINES, type Asker } from './llm.ts';

export type ItemType = 'need' | 'constraint' | 'option' | 'idea' | 'question';
export interface Item {
  type: ItemType;
  /** The point rewritten clearly, in the user's language, technical terms corrected. Never cut short. */
  text: string;
  /** Words copied exactly from the thought. */
  quote: string;
}

const TYPES: ItemType[] = ['need', 'constraint', 'option', 'idea', 'question'];
const MAX_ITEMS = 14;

export function buildExtractPrompt(thought: string, lang: 'tr' | 'en'): string {
  const language = lang === 'tr' ? 'Turkish' : 'English';
  return [
    'A non-programmer described what they want built. Turn it into a clear project definition for a coding agent.',
    'Return the points one by one:',
    '- idea: the overall goal (one point, first)',
    '- need: something the product must do',
    '- constraint: a limit it must respect, including every privacy, security and data rule (no personal data, redact tokens, data stays on the computer, offline)',
    '- option: something the user only said "maybe" or "later" about',
    '- question: something the user asked or left undecided',
    `Write "text" in ${language}: a complete, clear sentence; fix and name technical terms correctly; never cut it short.`,
    'One point per requirement: split sentences that hold two requirements, merge repeats. Keep everything the user said; add nothing they did not say.',
    '"quote" must be copied character for character from the thought (a part of one sentence is fine).',
    `At most ${MAX_ITEMS} points. Reply with JSON only: {"items":[{"type":"need","text":"...","quote":"..."}]}`,
    '',
    'THOUGHT:',
    thought,
  ].join('\n');
}

export function parseItems(text: string): Item[] | null {
  const list = (extractJson(text) as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) return null;
  const items = list
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map((x) => ({ type: x.type as ItemType, text: String(x.text ?? '').trim(), quote: String(x.quote ?? '').trim() }))
    .filter((x) => TYPES.includes(x.type) && x.text.length > 2)
    .slice(0, MAX_ITEMS);
  return items.length ? items : null;
}

export async function runExtract(thought: string, lang: 'tr' | 'en', ask?: Asker, engines = ENGINES): Promise<{ engine: string; items: Item[] }> {
  const { engine, value } = await askChain(buildExtractPrompt(thought, lang), parseItems, ask, engines);
  return { engine, items: value };
}
