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
  - `src/providers/demoProvider.ts`: Heuristic rule-based sentence/clause extraction (Unicode-aware).
  - `src/providers/glossary.ts`: Living glossary definitions and contextual relevance filtering.
  - `src/state/useWorkspace.ts`: Reducer-based undo/redo history + debounced `localStorage` persistence.
  - `src/components/`:
    - `Header.tsx`: Brand, honest demo banner, save indicator, undo/redo, language toggle.
    - `ThoughtPanel.tsx`: Thought editor, cursor management, and live source quotation viewer.
    - `LiveVoiceControls.tsx`: Microphone controls (Start, Pause/Resume, Stop, route disclosure, interim preview).
    - `Board.tsx` & `CardView.tsx`: Structured intention cards with status pills and actions.
    - `LearnPanel.tsx`: One open clarifying question at a time and contextual living concepts.
    - `TaskDrawer.tsx`: Readiness checklist, deterministic task package exporter, agent evidence verifier.
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
Success is measured by how much a coding agent still has to guess, not by how the cards look: give the prepared package to an agent and count its open questions (2026-10-17: raw idea 10 guesses / 5 of 10, old package 11 / 4 of 10, package with voice + agent pre-check 9 / 6 of 10, with the two architecture-level unknowns resolved).

## Guidelines for Claude Code
- Keep interface text in English.
- Use Vanilla CSS design system tokens in `src/index.css`.
- Any new features must leave runnable tests in `tests/`.
