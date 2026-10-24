# IntentCraft: product direction and roadmap

Private working document, 2026-10-25. It records where IntentCraft stands, what comparable paid products
offer, which of their features are worth adding, how that joins the rest of the owner's system, and what the
finished product is meant to be. App setup and commands: `intent-craft-app/README.md`. Status and rules:
`HANDOFF.md`, `CLAUDE.md`.

## 1. What IntentCraft is for

IntentCraft listens while the owner speaks or types and does three jobs:

1. **Capture scattered thoughts and recall what was forgotten.** Live dictation, every point anchored to the
   exact words it came from, open points written as questions.
2. **Turn the mess into a well-planned task or workflow.** Confirmed decisions become a bounded task package
   for a coding agent.
3. **Test the path from start to finish.** The original thought is the reference that the package, and later
   the delivered work, can be checked against.

The third job is the one no comparable product does, and it is where the paid value is.

## 2. Measured weaknesses today (fix before selling anything)

Measured on 2026-10-24 with two real owner requests (evidence:
`~/Documents/north-star-proof/20261024/intentcraft-jev/ASSESSMENT.md`).

| Problem | Where | Measured effect |
|---|---|---|
| Hard cap of 14 extracted points | `server/extract.ts`, `MAX_ITEMS=14` | 3 of 12 key requirements survived; 11 of 12 at a cap of 40 (+7.6 s) |
| Reply limit too small for long thoughts | `server/llm.ts`, `max_tokens: 2500` | Long request failed outright at cap 40 until raised |
| Export keeps only confirmed points and adds rules the owner never said | `src/domain/logic.ts`, `buildMarkdown` | Unconfirmed points silently drop out of scope; adds "Ask instead of guessing" |
| Pre-check asks things an agent can look up | `server/precheck.ts` | Asks for source paths and interfaces, then labels them "chose not to decide" |
| No review step, no cancel, no timing | whole app | A lossy package looks the same as a faithful one |

A tool sold on "nothing you said gets lost" cannot itself lose 9 of 12 requirements. These fixes come first.

## 3. Comparable paid products (October 2026)

Prices are from public pricing pages and reviews; confirm before relying on them.

| Product | What it does | Price | Licence of related open code |
|---|---|---|---|
| [Kiro](https://kiro.dev) (AWS) | Spec-first IDE and CLI: prompt to requirements, design and tasks; `/spec` mode, hooks, steering files | Free (50 credits), Pro $20, Pro+ $40, Pro Max $100, Power $200 per month | closed |
| [Traycer](https://traycer.ai) | Open-source desktop workspace: plans work, runs Claude Code, Codex, Cursor and OpenCode side by side, agents review each other, reusable workflows | Free for individuals; Sync $20 per user per month for teams | [traycerai/traycer](https://github.com/traycerai/traycer), MIT |
| [ChatPRD](https://www.chatprd.ai) | Rough notes, a transcript or one sentence into a PRD; scores the document for completeness and flags open questions; prototype from the spec; hands off to v0, Lovable, Cursor | Free, Pro $15 per month, Teams $29 per seat | closed |
| [CodeGuide](https://www.codeguide.dev) | Idea plus a few clarifying questions into PRD, tech spec and task list; specs for an existing GitHub codebase; agent that codes from them | not public in our sources | closed |
| [GitHub Spec Kit](https://github.com/github/spec-kit) | Free method: specify, then a separate clarify step that asks questions, then plan and tasks | free | MIT |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | Spec-driven change proposals for AI coding assistants | free | MIT |

How this was gathered: page text of the four commercial sites, the pricing pages, and the three open
repositories. REA (`rea analyze-web-bundle`, version 6.5.0) was run on the four public marketing sites in an
isolated headless browser. It only showed their stacks (Kiro: Next.js on webpack; Traycer: React on Vite); the
product logic sits behind sign-in and was not analysed. Closed products were studied from their public
behaviour and documentation only. No code was copied, and none will be copied from closed products. Code from
the MIT projects may be reused with its licence notice.

## 4. Features worth adding, by IntentCraft's three jobs

### Job 1: capture and recall

| Borrowed from | Feature | Paid? |
|---|---|---|
| Spec Kit (clarify step), ChatPRD (open questions) | **Blind-spot prompts while you speak:** "you have not said who uses it, what happens on failure, or when it counts as done" | Free tier; brings users in |
| ChatPRD (projects, context from Notion, Linear, Granola) | **Thought memory across days:** "three days ago you also said X; it is not in this package" | Pro |
| ChatPRD (score on completeness) | **Completeness score** of the captured thought, with one-click additions | Pro |

### Job 2: a well-planned task or workflow

| Borrowed from | Feature | Paid? |
|---|---|---|
| Kiro (requirements, design, tasks; `/spec`) | **Three-layer package:** what, how, in what order; each step has its done condition | Pro |
| Traycer (reusable workflows; break work into tickets) | **Workflow templates** (plan, debug, review) and phased tasks, one per agent | Pro |
| CodeGuide, ChatPRD (hand-off to Cursor, v0, Lovable) | **One-click hand-off** to Claude Code, Codex, Cursor as `AGENTS.md` or an MCP tool | Free; distribution |

### Job 3: test from start to finish (the paid core)

| Borrowed from | Feature | Why it sells |
|---|---|---|
| Kiro (requirements written as checkable statements) | **Every requirement becomes a pass/fail line:** "when X, the system shall Y" | Makes the check below exact instead of fuzzy |
| Traycer (checks the result against its plan) | **After-run report against the original words:** "9 of your 12 requests were built; these 3 are missing or changed" | Traycer checks against its own plan, so a requirement the plan lost is invisible to it. IntentCraft checks against what the owner actually said. |
| Our own intent check (below) | **Package review before hand-off:** coverage of every source sentence, lost must-keep items, invented rules | Already built and measured; ships first |

## 5. How this joins the owner's existing system

Reuse first; nothing below needs a new service.

| Existing part | Location | Role in IntentCraft |
|---|---|---|
| Intent check (deterministic) | `~/.claude/skills/ns-audit-loop/intent/intent_check.py` (stdlib, self-test, fixtures) | Becomes `/api/review` and the coverage line in the UI. Flags uncovered source sentences, lost must-keep items, decisions at the extractor cap, rules added by the export. |
| Jev typed review | `~/Projects/ns-ratchet/tools/jev_client.py`, called by `intent_check.py --jev` | Independent yes/no vote per uncovered sentence (about 0.3 to 0.6 s per call). Votes only; never writes corrections; a failed call is shown as "review not done", never as reviewed. |
| North Star goal intake | `goal_dispatch.dispatch(...)`, `goal_text_check.py` | "Send to North Star" exports a reviewed package as a goal; the evaluator and Outcome check then give the end-to-end verdict for job 3. |
| North Star audit loop | skill `ns-audit-loop` | Regression cases for IntentCraft changes: the two real lossy packages and one faithful control. |
| IdeaForge and harvest-hub | `~/Projects/IdeaForge`, `~/.local/state/harvest-hub/candidates.jsonl` | Ideas collected there can open as a new IntentCraft thought, so a found idea becomes a checked task in one step. |
| Local speech-to-text | `stt/server.py` | Already powers live dictation; stays local, which is a privacy selling point. |

## 6. Roadmap

Each phase ends with a check that can fail. App changes go through the gated North Star path (goal, independent
evaluator, rollback).

| Phase | Work | Done when |
|---|---|---|
| 0. Stop the loss | Raise the 14-point cap and the reply limit; export keeps unconfirmed points as "open", not dropped; remove invented export rules; pre-check stops asking what an agent can look up | Both real packages keep at least 11 of 12 and 10 of 14 must-keep items in `intent_check.py --must` |
| 1. Review before hand-off | `/api/review` calling `intent_check.py`; coverage line and stage strip (thought, requirements, review, corrections, reviewed package) showing real state; Jev votes optional | Faithful control shows 0 flags; lossy packages show their losses; a failed review never shows as reviewed |
| 2. Checkable requirements | Each confirmed point written as a "when X, shall Y" line with its source quote | Every line has a quote that occurs in the source |
| 3. After-run check | Read the agent's diff or North Star verdict and mark each line built, missing or changed | On 3 real past goals the report matches a human reading |
| 4. Memory and hand-off | Thought memory across sessions; one-click export to agents and North Star | A point dropped in session 1 is recalled in session 2 |
| 5. Charge | Landing page, then Free, Pro and Team tiers | 10 real users tried it and at least one paid |

## 7. Pricing proposal

| Tier | Contents | Price |
|---|---|---|
| Free | Live capture, blind-spot prompts, package, hand-off to any agent | $0 |
| Pro | Package review, thought memory, checkable requirements, after-run "what is missing" report | $15 to $20 per month |
| Team | Shared thought books, comments, Linear and Slack hand-off | about $29 per seat per month |

Spending money and publishing anything (landing page, pricing) are the owner's decisions; nothing in this
document authorises either.

## 8. What we get at the end

- A tool where the owner talks freely and nothing said gets lost: every sentence is either in the package,
  marked as open, or shown as deliberately left out.
- A package that has been reviewed before any agent sees it, with the review state shown honestly.
- After the agent finishes, a plain answer to "did it build what I asked?", line by line, tied to the
  owner's own words.
- One path from a scattered idea (spoken, or found by IdeaForge) to a North Star goal with a verdict, with
  no hand-copying between tools.
- A product with a feature the competitors do not have, priced in line with them, built mostly from parts
  that already exist and are measured.
