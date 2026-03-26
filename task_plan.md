# Task Plan: BarkFlow — Voice-First Personal Automation

## Goal
Fork OpenWhispr and build BarkFlow: a voice-first personal automation tool that transcribes, polishes (local LLM), routes (hotkey-driven), and stores (unified capture layer) voice and clipboard input.

## Current Phase
Phase 0

## Phases

### Phase 0: Fork + Audit + Harden
- [ ] Fork OpenWhispr, build locally, verify STT + Globe/Fn key work
- [ ] Security audit: fix webSecurity, add CSP, full preload bridge audit (~100 methods → allowlist)
- [ ] Proxy cloud API calls through main process (enables webSecurity: true)
- [ ] Set up Vitest + write first tests for existing critical paths
- [ ] Rebrand: icons, app name, README attribution
- [ ] Validate Fn key works reliably on target macOS version (GO/NO-GO gate)
- **Status:** pending
- **Depends on:** Nothing — this is the starting point
- **Blocked by:** Need to fork OpenWhispr first

### Phase 1a: Core Pipeline (sequential — each depends on previous)
- [ ] StorageProvider interface + wrap existing Kysely/database.js
- [ ] Add `entries` table, `projects` table, FTS5 index, `audit_log` table
- [ ] Rewrite ReasoningService → OllamaService (Ollama HTTP API at localhost:11434)
- [ ] Extend HotkeyManager → destination routing (Fn+key → arbitrary destinations)
- [ ] Test the full loop: speak → polish → route → paste
- [ ] **GATE: Use BarkFlow daily for 3 days. Fix issues before proceeding.**
- **Status:** pending
- **Depends on:** Phase 0 complete
- **Gate criteria:** Daily-usable. If Ollama latency bad → fix or cut. If Fn key broken → switch default.

### Phase 1b: New Features (parallel — start only after 1a gate passes)
- [ ] ClipboardMonitor (NSPasteboard polling + ConcealedType password detection)
- [ ] History UI (sidebar 280px + detail pane, extending HistoryView.tsx)
- [ ] Floating indicator reskin (adapt dictation panel → dog ear + Classic styles)
- [ ] Voice-to-Markdown (Fn+N → polished .md file to configurable directory)
- [ ] Projects system (Fn+P → project picker → capture to named bucket)
- [ ] Meeting recording (adapt AudioTapManager + transcript-only mode + streaming STT)
- [ ] File upload pipeline (drop zone + ffmpeg transcode → STT, background processing)
- [ ] Settings screen (extend SettingsPage.tsx: General, Hotkeys, Voice, Polish, Storage, Clipboard)
- [ ] Onboarding adaptation (reorder: live demo first, then STT, then Ollama)
- **Status:** pending
- **Depends on:** Phase 1a gate passed

### Phase 2: MCP Plugin System
- [ ] Implement BarkFlow as MCP client
- [ ] Build 3-4 first-party MCP server plugins (Todoist, Notion, Calendar, Slack)
- [ ] MCP server discovery + management UI
- [ ] MCP plugin permission model (declared network domains, data minimization, sandbox)
- [ ] Projects → dispatch to MCP integrations
- **Status:** pending
- **Depends on:** Phase 1b complete

### Phase 3: Polish & Ship
- [ ] Run /design-consultation → create DESIGN.md
- [ ] Command bar (Cmd+K) — text alternative for voice
- [ ] Performance optimization (FTS5 at scale, virtual scrolling for large history)
- [ ] Documentation (CONTRIBUTING.md, user guide)
- [ ] First public release
- **Status:** pending
- **Depends on:** Phase 2 complete

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
| src/barkflow/ isolation | Minimizes merge conflicts with upstream. Bridge pattern for OpenWhispr hooks. |
| Strict TypeScript for BarkFlow only | Type safety for new code without fixing all OpenWhispr type errors |
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
