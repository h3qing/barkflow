# WhisperWoof

**Voice-first personal automation for power users.**

Speak a command. WhisperWoof transcribes it, polishes it with a local LLM, and routes it to the right place — all without leaving your keyboard.

> Named after Mando, a dog who listens faithfully, fetches what you need, and gets things done.
> "Bark" is your voice into the mic. "Flow" is the workflow pipeline that carries your command to completion.

---

## What is WhisperWoof?

WhisperWoof is an open-source, voice-first personal automation tool built on top of [OpenWhispr](https://github.com/OpenWhispr/openwhispr). OpenWhispr handles the voice layer. WhisperWoof adds the workflow layer: hotkey-triggered, async workflows with a plugin system that lets your voice drive real actions.

### The Problem

Voice transcription tools are good at turning speech into text, but they stop there. You still have to manually route the output — copy-paste into a todo app, open a browser, switch windows.

The open-source landscape has two mature layers that exist independently:

- **Voice/Transcription:** OpenWhispr, Whispering, VoiceInk — speech-to-text with local Whisper/Parakeet models
- **Workflow Automation:** n8n, Activepieces, Huginn — workflow engines with hundreds of connectors

Nobody has built the bridge between them. **WhisperWoof is that bridge.**

### How It Works

```
Hold hotkey → Speak → Release

    Voice ──▶ Local STT (Whisper/Parakeet)
                 │
                 ▼
            Local LLM Polish (Ollama)
            Removes filler, fixes grammar, formats cleanly
                 │
                 ▼
            Hotkey-driven routing
                 │
                 ├──▶ Fn         → Paste polished text at cursor
                 ├──▶ Fn + T     → Add to todo list
                 ├──▶ Fn + N     → Save as Markdown note
                 ├──▶ Fn + C     → Add to calendar
                 └──▶ All entries saved to searchable history
```

Every hotkey combo maps to a destination. You control where your voice goes — explicitly, not by AI guessing.

## Features

### Phase 1 — MVP (in development)

- **Local AI text polish** — Like Wispr Flow's clean output, but running through a local LLM (Ollama) instead of cloud APIs. Your voice never leaves your machine.
- **Hotkey-driven routing** — Different key combos send your voice to different destinations. Fn to paste, Fn+T to todo, Fn+N for notes. Fully configurable.
- **Unified capture layer** — Voice history + clipboard history in one searchable system. Everything you ever said or copied, retrievable.
- **Audio playback** — Tap any history entry to replay the original recording. "What did I actually say?"
- **Voice-to-Markdown** — Think out loud, get a polished Markdown note saved to your preferred directory (Obsidian, ~/Notes, anywhere).
- **Floating speaking indicator** — Visual feedback when recording. Choose between Classic (waveform) and Bark (animated dog ear) styles.
- **Storage management** — See your disk usage, clear audio cache, configure retention.
- **Onboarding wizard** — Guided setup for STT model, Ollama, and storage preferences.

### Phase 2 — MCP Plugin System (planned)

- **Plugins are MCP servers** — WhisperWoof is an [MCP](https://modelcontextprotocol.io/) client. Any existing MCP server works as a WhisperWoof plugin.
- **First-party plugins** — Todoist, Notion, Google Calendar, Slack.
- **Build your own** — Write an MCP server, connect it to WhisperWoof, trigger it with your voice.

## Design Principles

1. **Hotkey = intent.** The key combination you press determines where your voice goes. Explicit over magic.
2. **Local-first.** Everything runs on your machine. No cloud dependency. No data leaving your device.
3. **Fork, don't reinvent.** Built on OpenWhispr's proven STT engine and Electron shell.
4. **Power users first.** Built for people who care about control, customization, and owning their tools.

## Tech Stack

- **Runtime:** Electron + React 19 + TypeScript + Tailwind CSS v4 (inherited from OpenWhispr)
- **STT:** OpenAI Whisper / NVIDIA Parakeet (local, via OpenWhispr)
- **LLM Polish:** Ollama (local, optional — WhisperWoof works without it)
- **Storage:** SQLite with FTS5 full-text search (abstracted behind a provider interface for future backends)
- **Plugins:** Model Context Protocol (MCP)

## Requirements

- **macOS** (Mac-first; cross-platform support via Electron is possible but not the initial focus)
- **Ollama** (optional, recommended) — for AI text polishing. [Install Ollama](https://ollama.com/)
- A microphone

## Getting Started

> WhisperWoof is in early development. Setup instructions will be added as the project matures.

```bash
# Clone the repo
git clone https://github.com/[your-username]/whisperwoof.git
cd whisperwoof

# Install dependencies
npm install

# Start the app
npm start
```

## Credits & Acknowledgments

WhisperWoof is a fork of **[OpenWhispr](https://github.com/OpenWhispr/openwhispr)** — an open-source voice-to-text dictation app with local and cloud STT models. OpenWhispr provides WhisperWoof's speech-to-text engine, global hotkey system, and Electron application shell. We are grateful to the OpenWhispr team and community for building such a solid foundation.

WhisperWoof also builds on the shoulders of:

- **[OpenAI Whisper](https://github.com/openai/whisper)** — Open-source speech recognition model
- **[NVIDIA Parakeet](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2)** — High-accuracy ASR model
- **[Ollama](https://ollama.com/)** — Local LLM runtime for AI text polishing
- **[Model Context Protocol](https://modelcontextprotocol.io/)** — Open standard for AI tool integration

## License

MIT License — see [LICENSE](LICENSE) for details.

This project is a fork of [OpenWhispr](https://github.com/OpenWhispr/openwhispr), which is also MIT licensed.

## Contributing

WhisperWoof is in its early stages. Contributions, feedback, and ideas are welcome! Please open an issue to discuss before submitting a PR.

---

*Built with care by Heqing. Inspired by Mando, who always listens.*
