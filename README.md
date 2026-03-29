# BarkFlow

<!-- TODO: Add logo — ![BarkFlow](docs/assets/logo.png) -->

**Voice-first personal automation — speak, and it transcribes, polishes, routes, and stores.**

---

## What It Does

- **Voice to polished text.** Local Whisper STT + local Ollama LLM removes filler words, fixes grammar, and formats cleanly — your voice never leaves your machine.
- **Hotkey-driven routing.** Press a key combo to decide where your words go. Fn+N saves a Markdown note. Fn+T adds a todo. Fn+P captures to a project. No AI intent guessing — you're in control.
- **Unified capture.** Voice transcripts and clipboard history live in one searchable system with favorites, audio playback, and full-text search.

## Quick Start

```bash
git clone https://github.com/h3qing/barkflow.git
cd barkflow && npm install
npm run compile:native && npm run download:whisper-cpp
npm run build:renderer && npm start
```

Requires macOS and a microphone.

### Optional: Ollama for Text Polish

BarkFlow works without Ollama (you get raw transcripts). To enable AI text polish:

```bash
brew install ollama && ollama pull llama3.2:1b && ollama serve
```

## Features

| Feature | Description |
|---------|-------------|
| Local STT | Whisper and Parakeet models, fully offline |
| LLM Polish | 5 presets — Clean, Professional, Casual, Minimal, Structured |
| Clipboard Monitoring | Tracks clipboard changes + image capture, deduped |
| Projects | "Wandering mind" capture buckets for open-ended thinking |
| Command Bar | Cmd+K with prefix routing (`/todo`, `/note`, `/project`) |
| MCP Plugin System | BarkFlow is an MCP client — any MCP server works as a plugin |
| Meeting Recording | Dual-channel mic + system audio with speaker differentiation |
| File Import | Drop audio files for background transcription |
| Smart Model Advisor | Recommends Whisper model based on your system RAM |
| Floating Indicator | Dog ear silhouettes that perk up when you speak |
| History + Search | FTS5 full-text search across all voice and clipboard entries |
| Favorites | Star any transcript for quick access |

## Screenshots

<!-- Replace with actual screenshots -->

![Home](docs/screenshots/home.png)
![History](docs/screenshots/history.png)
![Command Bar](docs/screenshots/command-bar.png)
![Settings](docs/screenshots/settings.png)

## Architecture

All BarkFlow code lives in `src/barkflow/`, isolated from the upstream OpenWhispr codebase. A bridge layer (`src/barkflow/bridge/`) is the only place that imports OpenWhispr internals — this keeps merge conflicts minimal and the codebase clean.

```
src/barkflow/
  core/       Main process — storage, polish, routing, clipboard, pipeline
  ui/         Renderer — history, indicator, settings, projects
  bridge/     Hooks into OpenWhispr STT, hotkeys, and app lifecycle
```

Storage is abstracted behind a `StorageProvider` interface (currently SQLite with Kysely ORM). Data stays local.

## Built on OpenWhispr

BarkFlow is a fork of [OpenWhispr](https://github.com/OpenWhispr/openwhispr), which provides the STT engine, global hotkey system, and Electron shell. We're grateful to the OpenWhispr team for building such a solid foundation.

## License

MIT — see [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome. Please open an issue to discuss before submitting a PR. See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture details and dev commands.

---

*Named after Mando, Heqing's dog — who listens faithfully, fetches what you need, and gets things done.*
