# BarkFlow Design System

## Brand

**Name:** BarkFlow — named after Mando, the developer's dog.
**Tagline:** Voice-first personal automation.
**Personality:** Faithful, fast, friendly. Like a good dog — listens, understands, gets things done.

## Colors

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--bg-primary` | `#FFFFFF` | `#1a1a1a` | Main background |
| `--bg-secondary` | `#F5F5F5` | `#2a2a2a` | Sidebar, cards |
| `--bg-tertiary` | `#EBEBEB` | `#3a3a3a` | Hover, selected |
| `--text-primary` | `#1a1a1a` | `#F5F5F5` | Headings |
| `--text-secondary` | `#6B7280` | `#9CA3AF` | Timestamps, metadata |
| `--accent` | `#D97706` | `#D97706` | Brand amber (Mando's coat) |
| `--accent-muted` | `#FEF3C7` | `#78350F` | Accent backgrounds |
| `--success` | `#059669` | `#34D399` | Done states |
| `--error` | `#DC2626` | `#F87171` | Error states |

**Rule:** Warm Amber (#D97706) is the only brand color. Everything else is neutral.

## Typography

System font stack — no custom fonts. BarkFlow feels native.

```
font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
```

| Scale | Size | Weight | Usage |
|-------|------|--------|-------|
| xs | 11px | 400 | Metadata, IDs |
| sm | 13px | 400 | Timestamps, labels |
| base | 15px | 400 | Body text, entries |
| lg | 17px | 600 | Section headings |
| xl | 20px | 600 | Onboarding headings |

## Spacing

4px base unit: 4, 8, 12, 16, 24, 32, 48.

## Components

- **Buttons:** 6px radius. Primary = amber fill. Secondary = ghost.
- **Inputs:** 32px height, 8px padding, 1px border.
- **Cards/rows:** No shadows. `--bg-secondary` for differentiation.
- **Icons:** 16px sidebar, 20px detail. Monochrome unless semantic.

## Floating Indicator

Horizontal soundbar with dog ear silhouettes. Three states:
- **Idle:** Tiny dots, faint. Ears relaxed.
- **Speaking:** Full waveform, white+blue. Red pulsing dot. Ears perked.
- **Processing:** Amber bars, gentle pulse. Amber dot. Ears slightly perked.

## Information Hierarchy

1. **Home** — chronological transcripts with search + favorites
2. **History** — unified voice + clipboard with filters + detail pane
3. **Projects** — named capture buckets
4. **Plugins** — MCP server management
5. **Settings** — grouped by domain (Polish, Clipboard, Notes, Storage, Setup)

## Key Principles

1. Brand lives in the indicator and voice icons. Everything else is native macOS.
2. Empty states have warmth and guidance, not blank screens.
3. Every voice action has a keyboard/text alternative (Cmd+K).
4. Polish is invisible — the user sees clean text, not "AI-powered" labels.
5. Errors are visible, actionable, and never silent.
