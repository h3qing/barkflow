# BarkFlow — Developer Guide

## Project Overview

BarkFlow is a voice-first personal automation tool. Fork of OpenWhispr (Electron 39 + React 19 + TypeScript + Tailwind v4 + Vite).

Core pipeline: Voice → STT (Whisper/Parakeet) → LLM Polish (Ollama) → Hotkey-driven routing → Storage

## Planning & Progress

- **Task plan:** `task_plan.md` — Phases, decisions, progress tracking
- **Findings:** `findings.md` — OpenWhispr research, review decisions, technical discoveries
- **Progress log:** `progress.md` — Session-by-session log of work done
- **Design doc:** `docs/design/design-doc.md` — Full design specification (APPROVED)
- **CEO plan:** `docs/design/ceo-plan.md` — Scope decisions and vision
- **Review summary:** `docs/reviews/2026-03-23-initial-reviews.md` — Engineering, security, design reviews

## Architecture

- **StorageProvider interface** — All data access is abstracted. Phase 1 uses SqliteProvider (Kysely ORM + better-sqlite3). Future providers: Supabase, BarkFlow Cloud.
- **Hotkey = intent** — Key combo determines destination. No LLM intent detection.
- **MCP for plugins** (Phase 2) — Plugins are MCP servers. BarkFlow is an MCP client.
- **Local-first** — No mandatory cloud dependency. Ollama is optional (graceful degradation to raw transcript).
- **Bridge pattern** — `src/barkflow/bridge/` is the ONLY place that imports OpenWhispr code. All other BarkFlow code is isolated.

## Key Files (after fork setup)

```
src/barkflow/                 ← ALL BarkFlow additions
  core/                       ← Main process (strict TypeScript)
    storage/                  StorageProvider interface + SqliteProvider
    polish/                   OllamaService (adapts OpenWhispr's ReasoningService)
    router/                   HotkeyRouter (extends OpenWhispr's HotkeyManager)
    clipboard/                ClipboardMonitor (NSPasteboard polling)
    pipeline/                 Orchestrates STT → Polish → Route
  ui/                         ← Renderer (React + TSX)
    history/                  HistoryPanel, Search, AudioPlayer
    indicator/                FloatingIndicator (Classic + Bark dog ear styles)
    settings/                 BarkFlow settings sections
    projects/                 Project picker, project detail view
  bridge/                     ← ONLY place that imports OpenWhispr code
    stt-hook.ts               Hook into STT output
    hotkey-hook.ts            Extend HotkeyManager
    app-init.ts               BarkFlow init at startup
```

## Testing

Framework: **Vitest** (integrates with Vite config)

```bash
npx vitest              # Run tests
npx vitest --coverage   # Run with coverage
```

Target: 80%+ coverage on BarkFlow code. Test priorities:
1. StorageProvider CRUD + FTS search + Projects
2. LLM polish pipeline (mock Ollama, test fallback chain)
3. Hotkey routing dispatch
4. Clipboard monitor (dedup, ConcealedType detection)
5. Pipeline orchestration (STT → Polish → Route)
6. File import pipeline (transcode + background STT)

## Commands

```bash
npm install          # Install dependencies
npm start            # Start dev mode
npx vitest           # Run tests
npm run build        # Build for production
```

## Implementation Phases

See `task_plan.md` for full details. Summary:

- **Phase 0:** Fork + Audit + Harden (security, preload audit, Vitest setup, Fn validation)
- **Phase 1a:** Core Pipeline (StorageProvider, Ollama, routing) + daily-use gate
- **Phase 1b:** Features (clipboard, history UI, indicator, projects, meetings, file import)
- **Phase 2:** MCP Plugin System
- **Phase 3:** Polish & Ship
