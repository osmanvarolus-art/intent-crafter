# CLAUDE.md — IntentCraft Project Guide

## Overview
IntentCraft turns spoken or written thoughts into a bounded, reviewable task package for a coding agent. Non-programmers express intents freely, verify interpretations via exact source quotes, and explicitly confirm decisions without AI auto-approval.

## Core Invariants
1. **Explicit Confirmation**: AI suggestions never become confirmed requirements without an explicit "Confirm as decision" user action.
2. **Three Separate Axes**:
   - `origin`: `'ai'` | `'user'` (never changes after creation; an AI card confirmed by user remains `origin: 'ai'`).
   - `approval`: `'suggested'` | `'confirmed'` | `'rejected'`.
   - `freshness`: `'current'` | `'needs_review'`.
3. **Provenance Integrity**: Cards link to source text via exact character offsets `[start:end]`. If source text is edited and quotes differ, the card transitions to `freshness: 'needs_review'` without wiping approval history.
4. **Deterministic Task Package**: Generated Markdown Hand-off only includes confirmed, current decisions in the mandatory scope. Unconfirmed options are explicitly listed under out-of-scope.
5. **Reported vs. Verified Evidence**: Claims reported by an external agent remain `'reported'` until explicitly verified by the user.

## Commands
All commands run from `intent-craft-app/`:
```bash
# Install dependencies
npm install

# Start development server (http://localhost:5173)
npm run dev

# Run unit tests (Node.js native test runner)
npm test

# Run linter (oxlint)
npm run lint

# Build production bundle (TypeScript + Vite)
npm run build
```

## Project Structure
- `intent-craft-app/`: Primary React + TypeScript application
  - `src/domain/types.ts`: Core data structures (`Card`, `Workspace`, `TaskPackage`, `Evidence`).
  - `src/domain/logic.ts`: Pure business rules (staleness checks, readiness checks, deterministic markdown).
  - `src/domain/voice.ts`: Cursor-safe insertion of dictated text.
  - `src/domain/voiceSession.ts`: Dictation without browser speech services: phrase detection from microphone loudness, ordered transcription.
  - `src/providers/modelProvider.ts`: Points written by a local model (`server/extract.ts`, `/api/extract`), tied back to the user's exact words (`locate`); asked questions stay questions, privacy/security rules become constraints.
  - `src/providers/demoProvider.ts`: Rule-based sentence split, used only when no model answers (the header then says so).
  - `src/state/useWorkspace.ts`: Reducer-based undo/redo history + debounced `localStorage` persistence.
  - `src/components/` (layout: four steps across the top, your text on the left, the current step on the right):
    - `Header.tsx`: Brand, New idea (archives the current one), save indicator, undo/redo, language toggle.
    - `Steps.tsx`: Tell · Check · Questions · Task, with what is done and what is left.
    - `ThoughtPanel.tsx`: Voice + text; clicking a point selects its exact words in the text.
    - `LiveVoiceControls.tsx`: Dictation (Start, Pause/Resume, Stop) through the local STT service.
    - `CheckStep.tsx`: One line per point: kind, the point once, the user's quote, Keep / Drop / Edit, Keep all.
    - `QuestionsStep.tsx`: Agent pre-check and every open question with its own answer box or "let the agent decide".
    - `TaskStep.tsx`: What is still missing (with a link to the step), the package, the agent's report.
  - `tests/`:
    - `logic.test.ts`: Domain rules, demo provider, pre-check cards, damaged-data handling.
    - `voice.test.ts`, `voiceSession.test.ts`: Text insertion, phrase detection, speaking order, pause/resume, errors.
    - `precheck.test.ts`: Pre-check parsing and engine fallback. `storage.test.ts`: undo history and damaged-data backup.
- `assets/`: original HTML prototypes and design images.
- Reference projects (not copied here): two-agent spoken dialogue `~/Archive/20261004-dev-inventory/claude-dual`, local VoxCPM2 speech assistant `~/Archive/20261002-dev-inventory/voice-vox`.

## Running copy and local services
- `intentcraft.service` (user systemd) builds and serves the app at http://127.0.0.1:4173; Hyprland opens it on the right-hand monitor. Open it with `intentcraft`. After a change: `systemctl --user restart intentcraft`.
- `intentcraft-stt.service` runs `stt/server.py` (faster-whisper large-v3-turbo on the GPU, http://127.0.0.1:8797). The app reaches it through the Vite proxy at `/api/stt`; audio never leaves the machine. Browser speech APIs are not used (Brave has none).
- `/api/precheck` (Vite middleware, `intent-craft-app/server/precheck.ts`) asks a coding agent what it would otherwise guess: local models via llama-swap (127.0.0.1:8081, `gemma4-12b`, then `bonsai-27b`), the Claude CLI last. Override with `INTENTCRAFT_LLM_MODELS` / `INTENTCRAFT_LLM_URL`.

## Purpose metric
Success is measured by how much a coding agent still has to guess, not by how the cards look: give the prepared package to an agent and ask for its open questions and an actionability score (2026-10-17, same Turkish idea: raw idea 5/10, rule-split package 4/10, + voice and agent pre-check 6/10, + model-written points and the four-step layout 7/10; the remaining questions are implementation details).

## Guidelines for Claude Code
- Keep interface text in English.
- Use Vanilla CSS design system tokens in `src/index.css`.
- Any new features must leave runnable tests in `tests/`.
