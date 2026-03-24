# BarkFlow — Developer Guide

## Project Overview

BarkFlow is a voice-first personal automation tool. Fork of OpenWhispr (Electron + React 19 + TypeScript + Tailwind v4).

Core pipeline: Voice → STT (Whisper/Parakeet) → LLM Polish (Ollama) → Hotkey-driven routing → Storage

## Architecture

- **StorageProvider interface** — All data access is abstracted. Phase 1 uses SqliteProvider. Future providers: Supabase, BarkFlow Cloud.
- **Hotkey = intent** — Key combo determines destination. No LLM intent detection.
- **MCP for plugins** (Phase 2) — Plugins are MCP servers. BarkFlow is an MCP client.
- **Local-first** — No mandatory cloud dependency. Ollama is optional (graceful degradation to raw transcript).

## Key Files (after fork setup)

- `src/barkflow/` — All BarkFlow additions (keep separate from OpenWhispr core to minimize merge conflicts)
- `src/barkflow/storage/` — StorageProvider interface + SqliteProvider
- `src/barkflow/polish/` — Ollama LLM integration
- `src/barkflow/router/` — Hotkey → destination routing
- `src/barkflow/history/` — History UI + search + audio playback
- `src/barkflow/clipboard/` — NSPasteboard clipboard monitor
- `src/barkflow/indicator/` — Floating speaking indicator (Classic + Bark styles)
- `src/barkflow/onboarding/` — First-run setup wizard

## Design Documents

- Design doc: `~/.gstack/projects/barkflow/heqinghuang-main-design-20260323-222609.md`
- CEO plan: `~/.gstack/projects/barkflow/ceo-plans/2026-03-23-barkflow-mvp.md`

## Testing

Run tests with:
```bash
npm test
```

Target: 80%+ coverage. Test priorities:
1. StorageProvider CRUD + FTS search
2. LLM polish pipeline (mock Ollama, test fallback)
3. Hotkey routing dispatch
4. Clipboard monitor dedup

## Commands

```bash
npm install          # Install dependencies
npm start            # Start dev mode
npm test             # Run tests
npm run build        # Build for production
```
