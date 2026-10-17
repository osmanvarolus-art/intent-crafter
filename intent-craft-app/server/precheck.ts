// The coding agent's pre-check: read the draft task and list what it would otherwise have to guess.
// Runs on this machine: local models through llama-swap first, the Claude CLI (subscription) last.
import { spawn } from 'node:child_process';

export interface Question {
  q: string;
  why: string;
}

export interface PrecheckResult {
  engine: string;
  questions: Question[];
}

const LOCAL_URL = process.env.INTENTCRAFT_LLM_URL ?? 'http://127.0.0.1:8081/v1/chat/completions';
const LOCAL_MODELS = (process.env.INTENTCRAFT_LLM_MODELS ?? 'gemma4-12b,bonsai-27b').split(',').filter(Boolean);
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
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = (data as { questions?: unknown }).questions;
  if (!Array.isArray(list)) return [];
  return list
    .filter((x): x is { q: string; why?: unknown } => typeof x === 'object' && x !== null && typeof (x as { q?: unknown }).q === 'string')
    .map((x) => ({ q: x.q.trim(), why: typeof x.why === 'string' ? x.why.trim() : '' }))
    .filter((x) => x.q.length > 3)
    .slice(0, MAX_QUESTIONS);
}

async function askLocal(model: string, prompt: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(LOCAL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1200,
      chat_template_kwargs: { enable_thinking: false }, // thinking models otherwise spend the whole budget before answering
      reasoning_effort: 'none',
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`${model}: HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

function askClaude(prompt: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--model', 'sonnet', '--setting-sources', '', '--strict-mcp-config'], { signal });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`claude exited ${code}`))));
    child.stdin.end(prompt);
  });
}

export type Asker = (engine: string, prompt: string, signal: AbortSignal) => Promise<string>;

const defaultAsk: Asker = (engine, prompt, signal) => (engine === 'claude' ? askClaude(prompt, signal) : askLocal(engine, prompt, signal));

/** Try each engine in order; the first one that returns parseable questions wins. */
export async function runPrecheck(draft: string, lang: 'tr' | 'en', ask: Asker = defaultAsk, engines = [...LOCAL_MODELS, 'claude']): Promise<PrecheckResult> {
  const prompt = buildPrompt(draft, lang);
  const errors: string[] = [];
  for (const engine of engines) {
    try {
      const text = await ask(engine, prompt, AbortSignal.timeout(engine === 'claude' ? 180_000 : 120_000));
      const questions = parseQuestions(text);
      if (questions.length || /"questions"\s*:\s*\[\s*\]/.test(text)) return { engine, questions };
      errors.push(`${engine}: no usable answer`);
    } catch (e) {
      errors.push(`${engine}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(errors.join('; '));
}
