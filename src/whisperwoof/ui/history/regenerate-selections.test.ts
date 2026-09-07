import { describe, it, expect } from "vitest";
import {
  defaultSttSelection,
  defaultCleanupChoice,
  cleanupChoiceModel,
  selectionKey,
  parseSelectionKey,
  parseEntryMetadata,
  regenerationHistory,
  describeProvenance,
  KEEP_SELECTION,
} from "./regenerate-selections";
import type { RegenerateSttOption } from "../../../types/electron";

const opt = (over: Partial<RegenerateSttOption>): RegenerateSttOption => ({
  engine: "whisper",
  model: "turbo",
  label: "Turbo",
  downloaded: true,
  runtime: "offline",
  kind: "whisper",
  runnable: true,
  languages: null,
  ...over,
});

describe("defaultSttSelection", () => {
  const inventory = [
    opt({ model: "turbo" }),
    opt({ model: "small", downloaded: false, runnable: false }),
    opt({ engine: "parakeet", model: "sense-voice-zh-en", label: "SenseVoice", kind: "sense-voice" }),
    opt({ engine: "parakeet", model: "parakeet-tdt-0.6b-v3", label: "Parakeet", runnable: false }),
  ];

  it("starts on the configured whisper model when it can run", () => {
    expect(defaultSttSelection({ useLocalWhisper: true, whisperModel: "turbo" }, inventory, true)).toEqual({
      engine: "whisper",
      model: "turbo",
    });
  });

  it("starts on the configured sherpa model in nvidia mode", () => {
    expect(
      defaultSttSelection(
        { useLocalWhisper: true, localTranscriptionProvider: "nvidia", parakeetModel: "sense-voice-zh-en" },
        inventory,
        true
      )
    ).toEqual({ engine: "parakeet", model: "sense-voice-zh-en" });
  });

  it("falls back to any runnable model when the configured one cannot run", () => {
    expect(
      defaultSttSelection({ useLocalWhisper: true, whisperModel: "small" }, inventory, true)
    ).toEqual({ engine: "whisper", model: "turbo" });
  });

  it("keeps the current transcript when there is no audio or nothing can run", () => {
    expect(defaultSttSelection({ whisperModel: "turbo" }, inventory, false)).toBe(KEEP_SELECTION);
    expect(defaultSttSelection({ whisperModel: "turbo" }, [opt({ runnable: false })], true)).toBe(KEEP_SELECTION);
  });
});

describe("defaultCleanupChoice / cleanupChoiceModel", () => {
  it("mirrors what live dictation would do", () => {
    expect(defaultCleanupChoice({ useReasoningModel: false, isCloud: false, effectiveModel: "x", localModelIds: ["x"] })).toBe("none");
    expect(defaultCleanupChoice({ isCloud: true, effectiveModel: "", localModelIds: [] })).toBe("cloud");
    expect(
      defaultCleanupChoice({ isCloud: false, effectiveModel: "qwen3.5-4b-q4_k_m", localModelIds: ["qwen3.5-4b-q4_k_m"] })
    ).toBe("local:qwen3.5-4b-q4_k_m");
    // A configured model that is not downloaded is not offered as the default.
    expect(defaultCleanupChoice({ isCloud: false, effectiveModel: "qwen3.5-9b-q4_k_m", localModelIds: ["qwen3.5-4b-q4_k_m"] })).toBe("none");
  });

  it("maps choices to the ReasoningService model argument", () => {
    expect(cleanupChoiceModel("none")).toBeNull();
    expect(cleanupChoiceModel("cloud")).toBe("");
    expect(cleanupChoiceModel("local:qwen3.5-4b-q4_k_m")).toBe("qwen3.5-4b-q4_k_m");
  });
});

describe("selection keys", () => {
  it("round-trips through the picker value", () => {
    for (const sel of [KEEP_SELECTION, { engine: "whisper" as const, model: "turbo" }, { engine: "parakeet" as const, model: "sense-voice-zh-en" }]) {
      expect(parseSelectionKey(selectionKey(sel))).toEqual(sel);
    }
    expect(parseSelectionKey("garbage")).toBe(KEEP_SELECTION);
  });
});

describe("metadata helpers", () => {
  it("parses string and object metadata, tolerating garbage", () => {
    expect(parseEntryMetadata('{"a":1}')).toEqual({ a: 1 });
    expect(parseEntryMetadata({ a: 1 })).toEqual({ a: 1 });
    expect(parseEntryMetadata("nope")).toEqual({});
    expect(regenerationHistory('{"history":[{"rawText":"x"}]}')).toEqual([{ rawText: "x" }]);
    expect(regenerationHistory("{}")).toEqual([]);
  });

  it("describes provenance from stt + cleanup metadata", () => {
    const label = describeProvenance(
      { stt: { engine: "parakeet", model: "sense-voice-zh-en" }, cleanup: { choice: "local:qwen3.5-4b-q4_k_m", accepted: true } },
      { sttLabel: (_e, m) => (m === "sense-voice-zh-en" ? "SenseVoice" : null) }
    );
    expect(label).toBe("SenseVoice · qwen3.5-4b-q4_k_m");
    expect(describeProvenance({ stt: { source: "openai", model: "whisper-1" } }, {})).toBe("whisper-1");
    expect(describeProvenance({}, {})).toBeNull();
  });
});
