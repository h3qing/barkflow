# Findings & Decisions

## OpenWhispr Baseline (researched 2026-03-25)

### Tech Stack
| Technology | Version |
|---|---|
| Electron | ^39.0.0 |
| React | ^19.1.0 |
| TypeScript | ^5.9.3 (strict: false) |
| Tailwind CSS | ^4.1.10 (via @tailwindcss/vite) |
| Vite | ^6.3.5 |
| Zustand | ^5.0.11 (state management) |
| Radix UI + shadcn-ui | ^0.9.5 |
| better-sqlite3 | ^12.8.0 |
| Kysely ORM | ^0.28.14 |
| Zod | ^4.3.6 (schema validation) |
| i18next | ^25.8.4 (i18n, 10 languages) |
| electron-builder | ^26.4.0 |

### What OpenWhispr Provides (free from fork)
- **STT engines:** Whisper (local), Parakeet/sherpa-onnx (local), cloud BYOK (OpenAI, Groq, Deepgram streaming, AssemblyAI streaming, Mistral)
- **LLM polish:** ReasoningService + llamaServer.js (local llama.cpp) — BarkFlow will adapt to Ollama
- **Globe/Fn key:** Native Swift binary (`macos-globe-listener.swift`) using IOKit HID. Emits FN_DOWN/FN_UP via stdout.
- **Audio:** AudioManager (Web Audio API), AudioStorageManager, AudioTapManager (macOS CoreAudio for meeting capture)
- **Clipboard:** Native paste helpers (Swift macOS, C Windows/Linux) — paste only, NOT monitoring
- **Database:** better-sqlite3 + Kysely ORM, SQLite at app data path
- **UI:** shadcn-ui + Radix, frameless windows, custom title bar, TipTap rich editor, system tray
- **Features:** Onboarding flow, history view, notes system, custom dictionary, "Actions" (prompt templates), Google Calendar integration, auto-updater
- **Build:** ffmpeg-static bundled, electron-builder for packaging

### What OpenWhispr Does NOT Have
- **Testing:** ZERO tests. No test runner, no test files, no coverage config.
- **Plugin system:** No extension points, no MCP. Monolithic codebase.
- **StorageProvider abstraction:** Direct SQLite access, not behind interface.
- **Clipboard monitoring:** Has paste, not capture/history.
- **CSP:** No Content Security Policy configured anywhere.
- **Hotkey routing:** Hotkeys only for dictation/agent/meeting, not arbitrary destinations.

### Security Status (inherited)
| Window | sandbox | webSecurity | Notes |
|--------|---------|-------------|-------|
| Main (dictation) | true | true | OK |
| Control Panel | **false** | **false** | Needs: proxy cloud calls through main process |
| Agent Overlay | **false** | **false** | Same issue as control panel |
| Notification | true | true | OK |

- Preload bridge: ~100+ methods on `window.electronAPI` — needs full audit
- No CSP headers anywhere
- OAuth via safeStorage (good)

### Code Organization
```
openwhispr/
  main.js                    # Main process entry (~600 lines, CommonJS)
  preload.js                 # IPC bridge (~500+ lines)
  src/
    components/              # React components (ControlPanel, SettingsPage, HistoryView, etc.)
    hooks/                   # React hooks (useAudioRecording, useHotkey, useSettings, etc.)
    stores/                  # Zustand stores (settings, transcription, notes, actions)
    services/                # Business logic (ReasoningService, NotesService)
    helpers/                 # Main process modules (windowManager, hotkeyManager, database, etc.)
    config/                  # Constants, prompts
    models/                  # Model registry
    types/                   # TypeScript types
    utils/                   # Utilities
    locales/                 # i18n (10 languages)
  resources/                 # Native binaries (Swift, C)
```

### Hotkey System Architecture
- `HotkeyManager` — Electron `globalShortcut.register()` for standard combos
- `GlobeKeyManager` — Spawns native Swift binary for macOS Fn/Globe key (IOKit HID)
- `WindowsKeyManager` — Spawns native C binary for Windows low-level hooks
- Linux: GNOME (D-Bus), Hyprland (hyprctl), KDE (KGlobalAccel) managers

## Review Decisions (2026-03-23 to 2026-03-25)

### Design Review (score: 7/10 → 8/10)
- Main window: Sidebar (280px) + detail pane layout
- Menu bar: LSUIElement, Mando silhouette icon, dropdown with recent entries
- Floating indicator: 6-state machine (Idle → Ready → Recording → Processing → Done → Error)
- Toast system: top-right, stack 3, type-colored (info/success/warning/error)
- Empty state: dog animation + guided first recording + integration setup
- Adaptive feedback: learning mode (first 20) → expert mode
- Design tokens: color (light+dark), typography (system font), spacing (4px base)
- Window resize: collapse detail pane below 600px
- Encryption: FileVault for DB, safeStorage for audio only
- Command bar (Cmd+K): deferred to Phase 2

### Eng Review (9 issues, 0 critical gaps)
- Cloud providers: keep but proxy through main process
- Kysely ORM: keep (less migration)
- Code isolation: src/barkflow/ with bridge pattern
- TypeScript: strict for BarkFlow only (separate tsconfig)
- Test framework: Vitest
- Sandbox: accept false, focus on IPC hardening
- Phase 1 gate: explicit 1a/1b split with daily-use checkpoint

### Outside Voice Findings (10 items, 3 addressed)
- Phase 1 scope bloat → added explicit 1a/1b gate
- sandbox:true infeasible → switched to IPC hardening
- Ollama latency risk → benchmark in Phase 1a, fallback to raw
- Fork maintenance hand-waved → decide in Phase 0
- Clipboard polling battery cost → profile in Phase 1b
- FTS performance at 150K+ entries → address in Phase 3

## Resources
- Design doc: `docs/design/design-doc.md`
- CEO plan: `docs/design/ceo-plan.md`
- Review summary: `docs/reviews/2026-03-23-initial-reviews.md`
- OpenWhispr repo: https://github.com/OpenWhispr/openwhispr
- gstack review log: `~/.gstack/analytics/reviews.jsonl`
