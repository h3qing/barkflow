# Task Plan: WhisperWoof — Voice-First Personal Automation

## Goal
Fork OpenWhispr and build WhisperWoof: a voice-first personal automation tool that transcribes, polishes (local LLM), routes (hotkey-driven), and stores (unified capture layer) voice and clipboard input.

## Current Phase
Pre-release (v1.0 prep)

## Phases

### Phase 0: Fork + Audit + Harden
- [x] Fork OpenWhispr, build locally, verify app boots
- [x] Security audit: 241 IPC methods catalogued, CSP added, webSecurity re-enabled, URL/path validation
- [x] Proxy cloud API calls — CSP connect-src allowlist configured
- [x] Set up Vitest + write tests (70 tests passing across 4 files)
- [x] Rebrand: package.json, electron-builder.json, main.js, windowConfig.js
- [x] WhisperWoof core modules built: StorageProvider, SqliteProvider, OllamaService, HotkeyRouter, ClipboardMonitor, Pipeline
- [x] Wire WhisperWoof init into main.js (startApp + will-quit)
- [x] Validate Fn key — works, timing improved (75ms hold, 100ms cooldown, crash recovery)
- **Status:** complete
- **Depends on:** Nothing — this is the starting point
- **Done:** OpenWhispr merged, rebranded, security hardened, 70 tests pass, app boots

### Phase 1a: Core Pipeline (sequential — each depends on previous)
- [x] StorageProvider interface + wrap existing Kysely/database.js
- [x] Add `entries` table, `projects` table, FTS5 index, `audit_log` table
- [x] Rewrite ReasoningService → OllamaService (Ollama HTTP API at localhost:11434)
- [x] Save voice transcriptions to bf_entries (dual-write with OpenWhispr)
- [x] History query/search/delete API via IPC
- [x] Learning mode toast (before/after polish, first 20 captures)
- [x] Hotkey routing — via Command Bar (Cmd+K → /todo, /note, /project)
- [ ] **GATE: Use WhisperWoof daily for 3 days. Fix issues before proceeding.**
- **Status:** nearly complete (hotkey routing remaining)
- **Depends on:** Phase 0 complete ✓
- **Gate criteria:** Daily-usable. If Ollama latency bad → fix or cut. If Fn key broken → switch default.

### Phase 1b: New Features (parallel — start only after 1a gate passes)
- [x] ClipboardMonitor (polling every 500ms, dedup, saves to bf_entries)
- [x] Floating indicator reskin (dog ear SVG, amber brand, centered, 48px)
- [x] Voice-to-Markdown route (Fn+N → .md file to ~/Documents/WhisperWoof Notes/)
- [x] History UI (search + filters + detail pane + sidebar nav)
- [x] Projects system (create/delete projects, view entries, FolderOpen sidebar)
- [x] File import pipeline (validate + read + STT + polish + save to bf_entries)
- [x] Settings panel (Ollama status, clipboard toggle, notes dir, Sparkles sidebar)
- [x] Onboarding adaptation (removed dead auth code, WhisperWoof-themed text, local-first flow)
- [x] Meeting recording (meeting-bridge.js — session tracking, transcript assembly, bf_entries)
- **Status:** complete
- **Depends on:** Phase 1a gate passed

### Phase 2: MCP Plugin System
- [x] Implement WhisperWoof as MCP client (@modelcontextprotocol/sdk v1.28.0)
- [x] Build 3 first-party MCP server plugins (Todoist, Notion, Slack)
- [x] MCP server discovery + management UI (WhisperWoofPlugins.tsx)
- [x] MCP plugin permission model (network allowlist, data type filtering, minimal defaults)
- [x] Projects → dispatch to MCP integrations
- **Status:** complete
- **Depends on:** Phase 1b complete

### Phase 3: Polish & Ship
- [x] Command bar (Cmd+K) — text alternative for voice (shipped in Phase 2)
- [x] Performance optimization (virtual scrolling for 10K+ entries)
- [x] Documentation (CONTRIBUTING.md)
- [x] UI cleanup (removed Integrations, Support, simplified profile)
- [x] Smart model advisor (RAM-based recommendations)
- [x] Polish presets (5 personalities with eval framework)
- [x] DESIGN.md created with Mando palette
- [x] First public release (v1.0.0)
- **Status:** complete
- **Depends on:** Phase 2 complete ✓

### Phase 4: Competitive Feature Parity (post-v1.0)
- [x] Context-aware per-app polish (auto-detect frontmost app → select preset)
- [x] Voice editing commands (10 commands: rewrite, translate, summarize, fix, shorten, expand, format, simplify)
- [ ] BYOM for LLM polish (support GPT/Claude/Groq alongside Ollama)
- [ ] Adaptive learning (personalize polish to user's writing style over time)
- [ ] Mobile companion (iOS app or Telegram bot for voice capture on the go)
- **Status:** in_progress
- **Depends on:** Phase 3 complete ✓
- **Competitors:** Wispr Flow, SuperWhisper, Aqua Voice, DictaFlow, VoiceInk, Willow Voice

## Key Questions
1. Ollama latency: Can Llama 3.2 3B polish <1s on M1? (Benchmark in Phase 1a)
2. Fn key reliability: Does Globe key work on target macOS version? (Validate in Phase 0)
3. OpenWhispr upstream: Do we maintain merge compatibility or own the fork? (Decide in Phase 0)
4. NSPasteboard battery impact: Is 0.5s polling acceptable in Electron? (Profile in Phase 1b)

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Fork OpenWhispr (not Tauri rewrite) | Fastest path to daily-use. Inherits STT, hotkeys, UI, audio. |
| Keep Kysely ORM | Less migration work, existing OpenWhispr code stays compatible |
| src/whisperwoof/ isolation | Minimizes merge conflicts with upstream. Bridge pattern for OpenWhispr hooks. |
| Strict TypeScript for WhisperWoof only | Type safety for new code without fixing all OpenWhispr type errors |
| Vitest for testing | Integrates with existing Vite config, native ESM/TS support |
| IPC hardening over sandbox | sandbox:true impossible with native modules. Focus on CSP + preload audit. |
| FileVault for DB, safeStorage for audio | FTS5 incompatible with field-level encryption. Audio is biometric → stronger protection. |
| Cloud STT: keep but proxy through main | Enables webSecurity:true while preserving flexibility |
| Real-time streaming for meetings | Chunk-by-chunk STT, discard audio in transcript-only mode |
| Background processing for file imports | Progress bar in history list, user keeps using app |
| Learning → Expert adaptive feedback | First 20 captures show before/after toast, then auto-switch to minimal |
| Phase 1a/1b gate | Don't build features on a broken foundation |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| (none yet) | | |

## Notes
- Design doc: `docs/design/design-doc.md`
- CEO plan: `docs/design/ceo-plan.md`
- Review summary: `docs/reviews/2026-03-23-initial-reviews.md`
- OpenWhispr has ZERO tests — testing infrastructure built from scratch
- OpenWhispr repo: https://github.com/OpenWhispr/openwhispr
