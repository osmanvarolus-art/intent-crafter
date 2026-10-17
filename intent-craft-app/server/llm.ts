// One way to ask a model on this machine: local models through llama-swap first, the Claude CLI (subscription) last.
import { spawn } from 'node:child_process';

const LOCAL_URL = process.env.INTENTCRAFT_LLM_URL ?? 'http://127.0.0.1:8081/v1/chat/completions';
export const ENGINES = [...(process.env.INTENTCRAFT_LLM_MODELS ?? 'gemma4-12b,bonsai-27b').split(',').filter(Boolean), 'claude'];

export type Asker = (engine: string, prompt: string, signal: AbortSignal) => Promise<string>;

async function askLocal(model: string, prompt: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(LOCAL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 2500,
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
    // No tools: it only reads the text it is given and answers with text.
    const child = spawn('claude', ['-p', '--model', 'sonnet', '--tools', '', '--setting-sources', '', '--strict-mcp-config'], { signal });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`claude exited ${code}`))));
    child.stdin.end(prompt);
  });
}

export const defaultAsk: Asker = (engine, prompt, signal) => (engine === 'claude' ? askClaude(prompt, signal) : askLocal(engine, prompt, signal));

/** The first {...} block in a model answer (models wrap JSON in fences or prose). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Try each engine in order; the first answer `parse` accepts wins. */
export async function askChain<T>(prompt: string, parse: (text: string) => T | null, ask: Asker = defaultAsk, engines = ENGINES): Promise<{ engine: string; value: T }> {
  const errors: string[] = [];
  for (const engine of engines) {
    try {
      const value = parse(await ask(engine, prompt, AbortSignal.timeout(engine === 'claude' ? 180_000 : 120_000)));
      if (value !== null) return { engine, value };
      errors.push(`${engine}: no usable answer`);
    } catch (e) {
      errors.push(`${engine}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(errors.join('; '));
}
