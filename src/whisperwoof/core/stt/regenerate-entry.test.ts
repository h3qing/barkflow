/**
 * Tests for the regenerate-entry decisions (History → Regenerate).
 * Imports the real bridge module the IPC handlers use, so drift is impossible.
 */
import { describe, it, expect } from "vitest";
import * as regen from "../../bridge/regenerate-entry-pure.js";

const voiceRow = (over: Record<string, unknown> = {}) => ({
  id: "uuid-1",
  created_at: "2026-09-07T10:00:00.000Z",
  source: "voice",
  raw_text: "我们明天 deploy 一下",
  polished: "我们明天 deploy 一下。",
  audio_path: null,
  metadata: JSON.stringify({ timings: { sttMs: 300 } }),
  ...over,
});

describe("parseEntryMetadata", () => {
  it("accepts a JSON string, an object, and garbage", () => {
    expect(regen.parseEntryMetadata('{"a":1}')).toEqual({ a: 1 });
    expect(regen.parseEntryMetadata({ a: 1 })).toEqual({ a: 1 });
    expect(regen.parseEntryMetadata("not json")).toEqual({});
    expect(regen.parseEntryMetadata(null)).toEqual({});
    expect(regen.parseEntryMetadata("[1,2]")).toEqual({});
  });
});

describe("resolveAudioSource", () => {
  it("links a voice entry to its upstream transcription via metadata", () => {
    const row = voiceRow({ metadata: JSON.stringify({ transcriptionId: 42 }) });
    expect(regen.resolveAudioSource(row)).toEqual({ kind: "upstream", id: 42 });
  });

  it("uses the original file for imports", () => {
    const row = voiceRow({ source: "import", audio_path: "/tmp/meeting.m4a" });
    expect(regen.resolveAudioSource(row)).toEqual({ kind: "file", path: "/tmp/meeting.m4a" });
  });

  it("has nothing for clipboard images, meetings, or an unlinked legacy voice row", () => {
    expect(
      regen.resolveAudioSource(
        voiceRow({ source: "clipboard", audio_path: "/x.png", metadata: JSON.stringify({ type: "image" }) })
      )
    ).toBeNull();
    expect(regen.resolveAudioSource(voiceRow({ source: "meeting" }))).toBeNull();
    expect(regen.resolveAudioSource(voiceRow())).toBeNull();
    expect(regen.resolveAudioSource(voiceRow({ metadata: JSON.stringify({ transcriptionId: "42" }) }))).toBeNull();
  });
});

describe("matchUpstreamTranscription (legacy rows)", () => {
  const row = voiceRow();

  it("matches exact raw text within the window, reading SQLite UTC timestamps correctly", () => {
    const match = regen.matchUpstreamTranscription(row, [
      { id: 7, text: "我们明天 deploy 一下。", raw_text: "我们明天 deploy 一下", timestamp: "2026-09-07 09:59:58", has_audio: 1 },
    ]);
    expect(match?.id).toBe(7);
  });

  it("rejects different text and out-of-window candidates", () => {
    expect(
      regen.matchUpstreamTranscription(row, [
        { id: 1, text: "别的", raw_text: "别的", timestamp: "2026-09-07 10:00:00", has_audio: 1 },
        { id: 2, text: "我们明天 deploy 一下。", raw_text: "我们明天 deploy 一下", timestamp: "2026-09-07 08:00:00", has_audio: 1 },
      ])
    ).toBeNull();
  });

  it("prefers a candidate that still has audio, then the closest, then the newest", () => {
    const pick = (cands: unknown[]) => regen.matchUpstreamTranscription(row, cands as never)?.id;
    expect(
      pick([
        { id: 3, text: "x", raw_text: "我们明天 deploy 一下", timestamp: "2026-09-07 10:00:00", has_audio: 0 },
        { id: 2, text: "x", raw_text: "我们明天 deploy 一下", timestamp: "2026-09-07 10:00:30", has_audio: 1 },
      ])
    ).toBe(2);
    expect(
      pick([
        { id: 3, text: "x", raw_text: "我们明天 deploy 一下", timestamp: "2026-09-07 10:00:40", has_audio: 1 },
        { id: 2, text: "x", raw_text: "我们明天 deploy 一下", timestamp: "2026-09-07 10:00:05", has_audio: 1 },
      ])
    ).toBe(2);
    expect(
      pick([
        { id: 3, text: "x", raw_text: "我们明天 deploy 一下", timestamp: "2026-09-07 10:00:05", has_audio: 1 },
        { id: 2, text: "x", raw_text: "我们明天 deploy 一下", timestamp: "2026-09-07 10:00:05", has_audio: 1 },
      ])
    ).toBe(3);
  });

  it("matches the shown (polished) text against the upstream text column when raw_text is missing", () => {
    const match = regen.matchUpstreamTranscription(row, [
      { id: 9, text: "我们明天 deploy 一下。", raw_text: null, timestamp: "2026-09-07 10:00:01", has_audio: 1 },
    ]);
    expect(match?.id).toBe(9);
  });
});

describe("buildSttInventory", () => {
  const inventory = regen.buildSttInventory({
    whisper: [
      { model: "turbo", downloaded: true },
      { model: "small", downloaded: false },
      { model: "bogus", downloaded: true },
    ],
    parakeet: [
      { model: "sense-voice-zh-en", downloaded: true },
      { model: "nemotron-3.5-asr-streaming-0.6b", downloaded: true },
      { model: "parakeet-tdt-0.6b-v3", downloaded: false },
    ],
    whisperAvailable: true,
    parakeetOfflineAvailable: true,
    parakeetOnlineAvailable: false,
  });
  const by = (m: string) => inventory.find((i) => i.model === m)!;

  it("reports SenseVoice as downloaded and runnable when the caller says its files exist", () => {
    expect(by("sense-voice-zh-en")).toMatchObject({
      engine: "parakeet",
      kind: "sense-voice",
      runtime: "offline",
      downloaded: true,
      runnable: true,
      label: "SenseVoice",
    });
    expect(by("sense-voice-zh-en").languages).toContain("zh");
  });

  it("marks an online model unrunnable without the online binary", () => {
    expect(by("nemotron-3.5-asr-streaming-0.6b")).toMatchObject({
      runtime: "online",
      downloaded: true,
      runnable: false,
    });
  });

  it("carries whisper download state and drops ids the registry does not know", () => {
    expect(by("turbo")).toMatchObject({ engine: "whisper", downloaded: true, runnable: true });
    expect(by("small")).toMatchObject({ downloaded: false, runnable: false });
    expect(inventory.find((i) => i.model === "bogus")).toBeUndefined();
  });

  it("whisper is unrunnable without whisper-server", () => {
    const inv = regen.buildSttInventory({ whisper: [{ model: "turbo", downloaded: true }], whisperAvailable: false });
    expect(inv[0].runnable).toBe(false);
  });
});

describe("validateRegenerateRequest", () => {
  const inventory = regen.buildSttInventory({
    whisper: [{ model: "turbo", downloaded: true }, { model: "small", downloaded: false }],
    parakeet: [
      { model: "sense-voice-zh-en", downloaded: true },
      { model: "parakeet-tdt-0.6b-v3", downloaded: true },
      { model: "nemotron-3.5-asr-streaming-0.6b", downloaded: true },
    ],
    whisperAvailable: true,
    parakeetOfflineAvailable: true,
    parakeetOnlineAvailable: false,
  });

  it("accepts a runnable whisper model for any language", () => {
    expect(regen.validateRegenerateRequest({ engine: "whisper", model: "turbo" }, { inventory, language: "zh-CN" })).toEqual({
      ok: true,
      engine: "whisper",
      model: "turbo",
    });
  });

  it("refuses Chinese on Parakeet TDT but allows it on SenseVoice", () => {
    expect(
      regen.validateRegenerateRequest({ engine: "parakeet", model: "parakeet-tdt-0.6b-v3" }, { inventory, language: "zh-CN" })
    ).toMatchObject({ ok: false, code: "LANGUAGE_UNSUPPORTED" });
    expect(
      regen.validateRegenerateRequest({ engine: "parakeet", model: "sense-voice-zh-en" }, { inventory, language: "zh-CN" })
    ).toMatchObject({ ok: true });
    expect(
      regen.validateRegenerateRequest({ engine: "parakeet", model: "parakeet-tdt-0.6b-v3" }, { inventory, language: "auto" })
    ).toMatchObject({ ok: true });
  });

  it("names the precise reason a model cannot run", () => {
    expect(regen.validateRegenerateRequest({ engine: "whisper", model: "small" }, { inventory })).toMatchObject({
      ok: false,
      code: "MODEL_NOT_DOWNLOADED",
    });
    expect(
      regen.validateRegenerateRequest({ engine: "parakeet", model: "nemotron-3.5-asr-streaming-0.6b" }, { inventory })
    ).toMatchObject({ ok: false, code: "BINARY_MISSING" });
    expect(regen.validateRegenerateRequest({ engine: "cloud", model: "x" }, { inventory })).toMatchObject({
      ok: false,
      code: "ENGINE_UNKNOWN",
    });
    expect(regen.validateRegenerateRequest({ engine: "whisper", model: "nope" }, { inventory })).toMatchObject({
      ok: false,
      code: "MODEL_UNKNOWN",
    });
  });
});

describe("applyRegeneration / popRegenerationHistory", () => {
  const now = "2026-09-07T11:00:00.000Z";
  const row = voiceRow({ metadata: JSON.stringify({ transcriptionId: 42, timings: { sttMs: 300 } }) });

  it("replaces the text, keeps existing metadata, and records the previous text for undo", () => {
    const next = regen.applyRegeneration(row, {
      rawText: "我们明天 deploy 一下 然后 review",
      polished: "我们明天 deploy 一下，然后 review。",
      stt: { engine: "parakeet", model: "sense-voice-zh-en" },
      cleanup: { choice: "local:qwen3.5-4b-q4_k_m", accepted: true },
      now,
    });
    expect(next.raw_text).toBe("我们明天 deploy 一下 然后 review");
    expect(next.polished).toBe("我们明天 deploy 一下，然后 review。");
    expect(next.metadata.transcriptionId).toBe(42);
    expect(next.metadata.timings).toEqual({ sttMs: 300 });
    expect(next.metadata.stt).toEqual({ engine: "parakeet", model: "sense-voice-zh-en" });
    expect(next.metadata.regeneratedAt).toBe(now);
    expect(next.metadata.history).toHaveLength(1);
    expect(next.metadata.history[0]).toMatchObject({
      rawText: "我们明天 deploy 一下",
      polished: "我们明天 deploy 一下。",
      stt: null,
    });
  });

  it("stores polished as null when cleanup was off or changed nothing", () => {
    expect(regen.applyRegeneration(row, { rawText: "raw", polished: null, now }).polished).toBeNull();
    expect(regen.applyRegeneration(row, { rawText: "raw", polished: "raw", now }).polished).toBeNull();
  });

  it("caps history and undo restores the most recent previous text", () => {
    let current: Record<string, unknown> = { ...row };
    for (let i = 0; i < regen.HISTORY_CAP + 3; i++) {
      const next = regen.applyRegeneration(current, { rawText: `raw ${i}`, polished: `polished ${i}`, now });
      current = { ...current, raw_text: next.raw_text, polished: next.polished, metadata: next.metadata };
    }
    expect((current.metadata as { history: unknown[] }).history).toHaveLength(regen.HISTORY_CAP);

    const undone = regen.popRegenerationHistory(current);
    expect(undone?.raw_text).toBe(`raw ${regen.HISTORY_CAP + 1}`);
    expect(undone?.polished).toBe(`polished ${regen.HISTORY_CAP + 1}`);
    expect(undone?.metadata.history).toHaveLength(regen.HISTORY_CAP - 1);
    expect(undone?.metadata.transcriptionId).toBe(42);
  });

  it("undo with no history is a no-op, and the last undo clears regeneratedAt", () => {
    expect(regen.popRegenerationHistory(row)).toBeNull();
    const once = regen.applyRegeneration(row, { rawText: "raw", polished: "p", now });
    const back = regen.popRegenerationHistory({ ...row, ...once });
    expect(back?.raw_text).toBe(row.raw_text);
    expect(back?.metadata).not.toHaveProperty("regeneratedAt");
  });
});
