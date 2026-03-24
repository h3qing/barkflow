# BarkFlow Review Summary — 2026-03-23

Three independent reviews completed in parallel. This is the CEO-ready synthesis.

---

## Scorecard

| Review | Score | CRITICAL | HIGH | MEDIUM | LOW |
|--------|-------|----------|------|--------|-----|
| **Engineering** | Solid | 0 | 6 | 7 | 5 |
| **Security** | Needs work | 5 | 7 | 9 | 2 |
| **Design/UX** | 6.3/10 | — | 3 | 5 | 2 |

---

## The 5 Things That Must Be Addressed Before Writing Code

### 1. Encrypt data at rest (Security CRITICAL)
Voice recordings are biometric data. Clipboard captures passwords. Both are stored unencrypted.
- **Fix:** Use Electron's `safeStorage` API (macOS Keychain) to encrypt SQLite database and audio files.
- **Also:** Respect `org.nspasteboard.ConcealedType` — skip capturing clipboard entries marked as secrets by password managers (1Password, Bitwarden).

### 2. Define the "Processing" state in the voice pipeline (Design HIGH)
Between releasing the hotkey and text appearing at the cursor, the user sees... nothing. This 1-3 second gap is undefined. It's the moment that makes or breaks the "it just works" feeling.
- **Fix:** Floating indicator transitions from "recording" (ears up) → "thinking" (ears tilt, subtle pulse) → "done" (fade out). Specify this animation.

### 3. Add `updateEntry` to StorageProvider (Engineering HIGH)
The interface has save/get/delete but no update. The pipeline needs to update entries after creation (writing back audio_path, updating routed_to after routing completes). Without this, code will bypass the abstraction.
- **Fix:** Add `updateEntry(id: string, updates: Partial<Omit<Entry, 'id'>>): Promise<Entry>`.

### 4. Harden Electron security (Security HIGH)
Must verify OpenWhispr's Electron config: `nodeIntegration: false`, `contextIsolation: true`, strict CSP, no `remote` module. A single XSS in the renderer could access the entire filesystem.
- **Fix:** Audit OpenWhispr's `webPreferences` immediately after forking. Set strict CSP.

### 5. Add accessibility to the design (Design score: 4/10)
Neither document mentions accessibility. No keyboard navigation, no screen reader support, no `prefers-reduced-motion`, no text-input alternative for voice actions.
- **Fix:** Add an Accessibility section. Every UI surface needs keyboard nav. Every voice action needs a type-to-command alternative. Respect `prefers-reduced-motion` for the dog ear animation.

---

## Engineering Review — Key Findings

**Architecture verdict: Sound.** Linear pipeline with clean separation. No circular dependencies. StorageProvider abstraction is well-designed.

### Must-fix before implementation:
- **Missing `updateEntry`** on StorageProvider interface
- **Mic permission denied** not handled in failure modes
- **Empty input guard** before Ollama (null/empty transcript should skip polish, not send empty prompt)
- **Clipboard captures passwords** — detect and skip `ConcealedType` entries
- **Fn key interception** — verify OpenWhispr's Fn handling immediately after fork; offer alternative default hotkeys
- **Audio file orphan cleanup** — crash between DB delete and file delete leaves orphans; add startup cleanup

### Implementation sequence (critical path):
```
Fork → StorageProvider → Ollama Polish → Hotkey Router → History UI
       (parallel: Clipboard Monitor, Audio Storage, Floating Indicator)
```

### Proposed directory structure:
```
src/barkflow/          ← ALL BarkFlow additions here
  core/                ← Domain logic (no Electron/React deps)
    pipeline/          ← Orchestrates STT → Polish → Route
    polish/            ← Ollama integration
    router/            ← Hotkey → destination routing
    storage/           ← StorageProvider interface + SQLite
    clipboard/         ← NSPasteboard monitor
    audio/             ← Audio file storage
  ui/                  ← React components
    history/           ← HistoryPanel, Search, AudioPlayer
    indicator/         ← FloatingIndicator, ClassicWaveform, BarkDogEar
    onboarding/        ← Setup wizard
    settings/          ← Hotkeys, Storage, Ollama, Cache
  bridge/              ← ONLY place that touches OpenWhispr code
    stt-hook.ts        ← Hook into STT output
    hotkey-hook.ts     ← Extend hotkey system
    app-init.ts        ← BarkFlow init at startup
```

### Key architecture recommendation:
**Make the Router an explicit module** with `RouteDefinition[]` config, not implicit dispatch in the hotkey listener. This lets Phase 2 MCP plugins register as destinations cleanly.

---

## Security Review — Key Findings

**5 CRITICAL findings, 7 HIGH.** Most are addressable with standard practices.

### CRITICAL (must fix):
1. **I-01: Voice recordings stored unencrypted** — biometric data on disk, readable by any process
2. **I-02: Clipboard captures passwords** — 1Password, Bitwarden entries captured in plain text
3. **E-02: Malicious MCP server** (Phase 2) — can execute arbitrary code, exfiltrate data
4. **I-07: MCP data exfiltration** (Phase 2) — plugins receive all routed text, can silently send it anywhere
5. **I-11: No secrets management** — plugin API keys (Todoist, Notion, etc.) have no secure storage design

### HIGH:
- Ollama port can be hijacked by malicious process (verify PID before sending data)
- Ollama localhost API vulnerable to browser SSRF (`Access-Control-Allow-Origin: *`)
- Electron `nodeIntegration` / `contextIsolation` must be audited
- Missing Content Security Policy
- SQLite database unencrypted
- BYOD credentials (future) need encryption
- Audio file integrity (no checksums)

### Top security architecture recommendations:
- Use `safeStorage` API for all secrets and sensitive data encryption
- Set `~/.barkflow/` directory permissions to `0700`, files to `0600`
- Add `.metadata_never_index` to exclude from Spotlight
- Add an `audit_log` table from day one
- Design MCP permission model now (declare required network domains, data types)
- Proxy Ollama requests through BarkFlow with a shared secret header

---

## Design Review — Key Findings

**Overall: 6.3/10.** Strong brand concept, solid architecture, but UX layer is underspecified.

### Scores by dimension:
| Dimension | Score | Verdict |
|-----------|-------|---------|
| Information hierarchy | 7/10 | Good layers, toast system undefined |
| Interaction states | **5/10** | Processing state is a black hole; empty states missing |
| Voice input UX | 7/10 | Good model; edge cases need specification |
| History UI | 6/10 | Layout unspecified; use compact list with expandable rows |
| Onboarding | 7/10 | Reorder: lead with live demo, not storage config |
| Brand identity | **8/10** | Strong. Dog ear is the hero. Don't overextend. |
| Accessibility | **4/10** | Not mentioned at all. Major gap. |
| Responsive/adaptive | 6/10 | Indicator positioning, multi-monitor undefined |
| AI slop risk | 6/10 | Ban the word "AI" from user-facing strings |
| Competitive analysis | 7/10 | Wispr's minimalism + Raycast's history + dog personality |

### Brand guidance:
```
Primary:    Warm Amber  #D97706  (Mando's coat)
Secondary:  Slate Gray  #475569  (professional balance)
Accent:     Soft Cream  #FEF3C7  (warmth, sparingly)
Background: macOS system colors (respect light/dark mode)
```

**Key principle:** Brand lives in the ICON and FLOATING INDICATOR. Every other surface should feel like a native macOS app. The brand is seasoning, not the entree.

### Critical design recommendations:
1. **Define the Processing state** — dog ears transition: relaxed → perked (listening) → tilted (thinking) → fade (done)
2. **Reorder onboarding** — start with "Hold Fn and say something" (live demo), not storage config
3. **History layout** — compact list, not cards. Mic icon (amber) vs clipboard icon (gray). Expandable rows for voice entries with audio player.
4. **Ban "AI" in user-facing copy** — call it "polish" or "text cleanup," never "AI-powered"
5. **Empty states with Mando** — sleeping dog (no entries), perked ears (ready), fetching (loading)

---

## Cross-Review Agreement

All three reviewers independently flagged the same issues:
- **Clipboard password capture** (Security CRITICAL + Engineering HIGH)
- **Fn key reliability** (Engineering HIGH + Design issue)
- **Missing interaction states** (Design 5/10 + Engineering "paste-at-cursor failure")
- **Ollama as a dependency risk** (Engineering MEDIUM + Security HIGH)

This convergence means these are real issues, not reviewer bias.

---

## Recommended Tomorrow's Agenda

1. **Fork OpenWhispr** and audit: Electron security config, Fn key handling, STT output hooks, hotkey registration points
2. **Build StorageProvider** with `updateEntry` added, encryption via `safeStorage`
3. **Prototype Ollama integration** and benchmark latency (<1s target on M1)
4. **Define the floating indicator states** and Processing animation
5. **Add Accessibility and Security sections** to the design doc

The design doc and CEO plan are solid foundations. The reviews found no architectural flaws — just gaps in the details that need to be filled before code is written. The biggest risk is security (unencrypted biometric data), and the biggest UX gap is the Processing state.
