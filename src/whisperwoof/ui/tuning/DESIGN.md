# Pipeline Tuning Bench — Design

## Concept

A workbench where users test different pipeline configurations against
their own voice samples and pick the output they like best.

Three knobs to turn:
1. **STT Model** — tiny/base/small/medium/large/turbo/parakeet
2. **Polish Preset** — clean/professional/casual/minimal/structured
3. **LLM Provider+Model** — ollama:llama3.2:1b, ollama:llama3.2:3b, openai:gpt-4o-mini, etc.

## User Flow

1. **Create a test case**: record a voice sample or paste text
2. **Add variants**: pick N combinations of (STT model × preset × LLM)
3. **Run all**: each variant processes the same input independently
4. **Compare**: see all outputs in a grid/card layout
5. **Pick winner**: click "Use this config" on the best output
6. **Save**: winner becomes the default pipeline config

## UI Layout

```
┌─────────────────────────────────────────────────────┐
│ Pipeline Tuning Bench                    [+ Add Test]│
├─────────────────────────────────────────────────────┤
│                                                      │
│ Test Case: "can we learn what Anthropic did..."      │
│ Source: voice recording (10:14 PM)                   │
│ ─────────────────────────────────────────────        │
│                                                      │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│ │ Variant A │ │ Variant B │ │ Variant C │            │
│ │           │ │           │ │           │             │
│ │ STT:small │ │ STT:turbo │ │ STT:large │            │
│ │ LLM:1b   │ │ LLM:3b   │ │ LLM:gpt4m │            │
│ │ Pre:clean │ │ Pre:prof  │ │ Pre:clean │            │
│ │           │ │           │ │           │             │
│ │ "Can we   │ │ "Let's   │ │ "Can we   │            │
│ │  learn..." │ │  learn..." │ │  explore..│            │
│ │           │ │           │ │           │             │
│ │ 1.2s      │ │ 2.1s      │ │ 3.8s      │            │
│ │           │ │           │ │           │             │
│ │ [Use This]│ │ [Use This]│ │ [Use This]│            │
│ └──────────┘ └──────────┘ └──────────┘              │
│                                                      │
│ [+ Add Variant]                                      │
└─────────────────────────────────────────────────────┘
```

## Data Model

```typescript
interface TestCase {
  id: string;
  name: string;
  inputText: string;       // raw voice transcript or pasted text
  audioPath?: string;      // original audio file for re-STT
  createdAt: string;
}

interface Variant {
  id: string;
  testCaseId: string;
  sttModel: string;        // "small", "turbo", "large", etc.
  polishPreset: string;    // "clean", "professional", etc.
  llmProvider: string;     // "ollama", "openai", "anthropic", "groq"
  llmModel: string;        // "llama3.2:1b", "gpt-4o-mini", etc.
  output: string | null;   // the result text
  durationMs: number | null;
  error: string | null;
  status: "pending" | "running" | "done" | "error";
}
```

## Implementation Plan

### Backend (bridge/tuning-bench.js)
- saveTestCase / getTestCases / deleteTestCase
- runVariant(testCaseId, config) → processes through full pipeline
- Storage: JSON file (~/.config/WhisperWoof/tuning-bench.json)

### IPC Handlers
- whisperwoof-tuning-save-test
- whisperwoof-tuning-get-tests
- whisperwoof-tuning-run-variant
- whisperwoof-tuning-apply-config (set as default)

### UI (ui/tuning/TuningBench.tsx)
- Test case selector/creator
- Variant grid with add/remove
- Run button (runs all variants in parallel)
- "Use This Config" button per variant
- Speed comparison (duration badges)
