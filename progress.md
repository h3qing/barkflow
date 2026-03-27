# Progress Log

## Session: 2026-03-23 — Initial Planning

### Planning & Design
- **Status:** complete
- **Started:** 2026-03-23
- Actions taken:
  - Ran /office-hours — produced design doc (Builder mode)
  - Ran /plan-ceo-review — SCOPE EXPANSION mode, 6 proposals (4 accepted, 2 deferred)
  - Ran 3 parallel reviews: engineering, security, design/UX
  - Synthesized review summary (5 critical blockers identified)
- Files created/modified:
  - `~/.gstack/projects/barkflow/heqinghuang-main-design-20260323-222609.md` (design doc, APPROVED)
  - `~/.gstack/projects/barkflow/ceo-plans/2026-03-23-barkflow-mvp.md` (CEO plan, ACTIVE)
  - `~/.gstack/projects/barkflow/review-summary-2026-03-23.md` (review synthesis)
  - `docs/reviews/2026-03-23-initial-reviews.md` (committed to repo)

## Session: 2026-03-25 — Design Review + Eng Review + Repo Setup

### Design Doc Updates (pre-review)
- **Status:** complete
- Actions taken:
  - Added `updateEntry` to StorageProvider interface
  - Added Floating Indicator state machine (6 states, transitions, animation specs)
  - Added Accessibility section (keyboard nav, screen reader, reduced motion)
  - Added Security section (encryption, clipboard passwords, Electron hardening, audit log)

### Design Review (/plan-design-review)
- **Status:** complete
- **Score:** 7/10 → 8/10
- Actions taken:
  - Ran full 7-pass review: Info Architecture, States, Journey, AI Slop, Design System, Responsive, Decisions
  - Independent Claude subagent review (5 CRITICAL, 6 HIGH, 6 MEDIUM, 2 LOW findings)
  - Added main window layout (sidebar + detail pane wireframe)
  - Added menu bar presence (LSUIElement, dropdown spec)
  - Resolved FTS vs encryption contradiction (chose FileVault for DB)
  - Added interaction states table (history, onboarding, migration, toasts)
  - Added adaptive feedback (learning → expert mode)
  - Added design tokens (color, typography, spacing, components)
  - Added window resize behavior (collapse detail below 600px)
  - Added hotkey configuration UI spec (record flow, conflict detection)
  - Added settings screen information architecture (6 sections)
  - Added audio player component spec
  - Added markdown notes spec (directory, filename format)
  - Deferred command bar (Cmd+K) to Phase 2
- Decisions: 8 added to plan
- Files modified:
  - `~/.gstack/projects/barkflow/heqinghuang-main-design-20260323-222609.md`

### Eng Review (/plan-eng-review)
- **Status:** complete
- **Issues found:** 9, **Critical gaps:** 0
- Actions taken:
  - Researched OpenWhispr codebase in depth (tech stack, architecture, security, hotkey system, testing)
  - Reframed Phase 1 items as ADAPT/NEW/HARDEN based on OpenWhispr baseline
  - Architecture: cloud providers kept + proxied, Kysely kept, preload audit in Phase 0
  - Code quality: src/barkflow/ isolation with bridge pattern, strict TS for BarkFlow only
  - Tests: Vitest framework, 30+ gap coverage diagram, test plan artifact
  - Performance: real-time streaming for meetings, background processing for file imports
  - Added 3 new features: Projects (wandering mind), Meeting recording, File upload pipeline
  - Updated data model (new source types, project_id, Project interface, SQL schema)
  - Added explicit Phase 1a/1b gate ("daily-usable" checkpoint)
  - Security: accepted sandbox:false reality, IPC hardening approach
  - Outside voice: 10 findings, 3 directly addressed (scope gate, sandbox, latency)
  - Added failure modes for meeting disconnect + file import errors
- Decisions: 12 made
- Files modified:
  - `~/.gstack/projects/barkflow/heqinghuang-main-design-20260323-222609.md`

### Repo Setup
- **Status:** complete
- Actions taken:
  - Copied design docs into repo (`docs/design/`)
  - Created `task_plan.md` — phased implementation plan
  - Created `findings.md` — OpenWhispr research + review decisions
  - Created `progress.md` — this file
- Files created:
  - `docs/design/design-doc.md`
  - `docs/design/ceo-plan.md`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### Overnight Build Session (continued)
- **Status:** complete
- Actions taken:
  - npm install completed (Node 22 required, cache permission fix with --cache /tmp/npm-cache)
  - Wired BarkFlow init into main.js (startApp + will-quit)
  - Compiled native binaries (Globe key, fast-paste, audio-tap, mic-listener)
  - Built Vite renderer (npm run build:renderer)
  - Verified app launches: `npx electron .` boots, shows UI, no crashes
  - All 70 tests pass (248ms)
- Files created/modified:
  - `src/barkflow/bridge/app-init.js` (CommonJS shim for main process)
  - `main.js` (wired BarkFlow init + shutdown)
  - `package.json` (vitest added as dev dependency)

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| Pipeline happy path | raw text + polish + route | polished + routed + stored | Pass | ✓ |
| Pipeline polish disabled | raw text, polish off | raw text routed directly | Pass | ✓ |
| Pipeline polish failure | Ollama timeout | fallback to raw text | Pass | ✓ |
| Pipeline storage failure | DB locked | returns synthetic entry | Pass | ✓ |
| OllamaService happy path | mock Ollama API | polished text returned | Pass | ✓ |
| OllamaService timeout | 2s timeout | fallback to raw | Pass | ✓ |
| OllamaService empty input | blank string | skip polish, return raw | Pass | ✓ |
| HotkeyRouter register + resolve | Fn+T → todo | route found | Pass | ✓ |
| HotkeyRouter unknown hotkey | Fn+Z | fallback to paste-at-cursor | Pass | ✓ |
| ClipboardMonitor dedup | same text twice | captured once | Pass | ✓ |
| ClipboardMonitor concealed | password entry | skipped | Pass | ✓ |
| App launch | npx electron . | boots without crash | Pass | ✓ |
| 70 total tests across 4 files | vitest run | all pass | 70/70 | ✓ |

## Session: 2026-03-26 — User Testing Feedback + Fixes + Phase 1a

### User Feedback Investigation
- **Status:** complete
- User reported: hotkey Ctrl+Option not registering, whisper binary intermittent failure,
  no recording visual feedback, OpenWhispr branding everywhere, local model not default,
  no text beautification visible
- Launched 4 parallel investigation agents: hotkey, whisper, branding, visual feedback
- Root causes identified for all issues

### Fixes Applied
- **Status:** complete
- Actions taken:
  - Default `useLocalWhisper` to true (local-first)
  - Default `floatingIconAutoHide` to true (icon only during recording)
  - Default `startMinimized` to true (menu bar app)
  - Fixed intermittent whisper: clear cached binary path + auto-start server before transcription
  - Added macOS modifier-only hotkey validation (reject Ctrl+Option with clear message)
  - Comprehensive rebranding: 620+ string replacements across 10 locale files
  - Fixed all user-facing OpenWhispr references (title, menus, tray, dialogs, settings)
  - Removed Google Fonts CDN import (blocked by CSP, unnecessary)
  - Removed HeroTools code signing identity
  - Updated support email, author, D-Bus names, OAuth protocol

### Phase 1a: Ollama Polish Integration
- **Status:** in_progress
- Actions taken:
  - Created ollama-bridge.js (main process) — calls Ollama HTTP API
  - Registered IPC handlers: barkflow-ollama-polish, barkflow-ollama-check
  - Exposed in preload bridge
  - Hooked into useAudioRecording.js onTranscriptionComplete flow
  - Auto-polish: STT → Ollama polish → paste polished text
  - Fallback: if Ollama unavailable, paste raw text (no delay)
  - Both raw and polished saved to history
- Files created/modified:
  - `src/barkflow/bridge/ollama-bridge.js` (new)
  - `src/helpers/ipcHandlers.js` (added IPC handlers)
  - `preload.js` (exposed new methods)
  - `src/hooks/useAudioRecording.js` (hooked polish into flow)
  - `src/stores/settingsStore.ts` (default changes)
  - `src/utils/hotkeyValidator.ts` (macOS validation)
  - `src/helpers/whisper.js` (server reliability fix)
  - All locale translation files (branding)

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-03-26 | whisper-server binary not found (intermittent) | 1 | Cleared cached path + added auto-start before transcription |
| 2026-03-26 | Ctrl+Option hotkey not registering | 1 | Added macOS modifier-only validation with clear error message |
| 2026-03-26 | Google Fonts blocked by CSP | 1 | Removed CDN import — font bundled locally |

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase 1b nearly complete — 8/9 features done, ready for merge |
| Where am I going? | Merge → user testing → meeting recording → Phase 2 (MCP) |
| What's the goal? | Fork OpenWhispr → BarkFlow: voice-first personal automation |
| What have I learned? | OpenWhispr provides STT, hotkeys, audio, LLM polish, SQLite, UI. Needs: tests, security hardening, StorageProvider, clipboard monitoring, routing. See findings.md |
| What have I done? | Design doc approved, CEO plan active, design review 8/10, eng review cleared, 3 new features added, repo organized. See above. |
