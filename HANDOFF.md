# IntentCraft Handoff Document

This document provides complete instructions for continuing development and taking over the IntentCraft project via **Claude Code**.

---

## 1. Executive Summary
IntentCraft bridges the gap between non-technical users and coding agents. It provides a structured workspace where users speak or write thoughts freely, examine interpretations anchored to exact source text, explicitly confirm decisions, and export a bounded, deterministic task package.

The application has been scaffolded, implemented, and tested in TypeScript + React + Vite.

---

## 2. Directory Layout & Key Components
```
intent-crafter/
├── CLAUDE.md                   # Instructions for Claude Code
├── HANDOFF.md                  # This handoff document
├── intent-craft-app/           # Main React + TypeScript application
│   ├── src/
│   │   ├── domain/
│   │   │   ├── types.ts        # Card, SourceRef, Evidence, Workspace models
│   │   │   ├── logic.ts        # Pure domain rules (reversibility, staleness, readiness)
│   │   │   └── voice.ts        # Live voice transcription logic & duplicate prevention
│   │   ├── providers/
│   │   │   ├── demoProvider.ts # Offline heuristic rule parser (honest demo provider)
│   │   │   └── glossary.ts     # Contextual glossary triggers
│   │   ├── state/
│   │   │   └── useWorkspace.ts # Reducer with undo/redo stack & localStorage sync
│   │   ├── components/
│   │   │   ├── Header.tsx
│   │   │   ├── ThoughtPanel.tsx
│   │   │   ├── LiveVoiceControls.tsx
│   │   │   ├── Board.tsx
│   │   │   ├── CardView.tsx
│   │   │   ├── LearnPanel.tsx
│   │   │   └── TaskDrawer.tsx
│   │   ├── index.css           # Vanilla CSS design system tokens
│   │   └── App.tsx             # Root workspace container
│   ├── tests/
│   │   ├── logic.test.ts       # 7 invariant unit tests
│   │   └── voice.test.ts       # 6 live voice unit tests
│   └── package.json
├── claude-dual/                # Copied prior art: dual-agent audio floor controller
├── voice-vox/                  # Copied prior art: VoxCPM2 local speech assistant
└── assets/                     # Original HTML prototypes & Gemini design images
```

---

## 3. Working Commands
From `intent-craft-app/`:
```bash
# 1. Install dependencies
npm install

# 2. Run unit tests
npm test

# 3. Run linter
npm run lint

# 4. Build bundle
npm run build

# 5. Run dev server
npm run dev
```

---

## 4. Current State & Verification
- **Test Suite**: 13/13 unit tests passing (Node.js test runner).
- **Linter**: `oxlint` reports 0 errors and 0 warnings.
- **Production Build**: `tsc -b && vite build` succeeds with zero errors.
- **Dev Server**: Running at `http://localhost:5173`.
- **Live Voice**:
  - Start, Pause/Resume, Stop controls with listening, paused, processing, and error states.
  - Separate interim transcription display.
  - Finalized text safely appended without overwriting user typed corrections.
  - Natural pause detection (1500ms silence) suggests relevant concepts without interrupting the speaker.
  - Route disclosure explaining Web Speech API usage.

---

## 5. Next Steps for Claude Code
1. **Local Model Provider**: If local Whisper or Ollama is brought online, implement a `WhisperLocalProvider` implementing the `Provider` interface in `src/providers/`.
2. **Audio Waveform Visualizer**: Add a visual frequency/RMS meter using Web Audio API (`AnalyserNode`) during active listening.
3. **Export Integrations**: Add direct integration with GitHub issues or Claude CLI tasks.
