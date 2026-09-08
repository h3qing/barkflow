/**
 * Pure choices behind the History → Regenerate panel: what the pickers
 * default to and how a cleanup choice maps to a ReasoningService model id.
 * No DOM, no stores — the panel passes values in, tests pass values in.
 */
import type { RegenerateSttOption } from "../../../types/electron";

/** "keep" = do not re-run STT, only re-run cleanup on the current raw text. */
export interface SttSelection {
  engine: "whisper" | "parakeet" | "keep";
  model: string | null;
}

/**
 * "none"  → raw transcript only
 * "cloud" → the signed-in OpenWhispr cloud cleanup (ReasoningService model "")
 * "local:<id>" → a downloaded local GGUF by registry id
 */
export type CleanupChoice = "none" | "cloud" | `local:${string}`;

export interface SttSettingsView {
  useLocalWhisper?: boolean;
  localTranscriptionProvider?: string;
  whisperModel?: string;
  parakeetModel?: string;
}

export interface CleanupContext {
  useReasoningModel?: boolean;
  isCloud: boolean;
  effectiveModel: string;
  localModelIds: readonly string[];
}

export const KEEP_SELECTION: SttSelection = { engine: "keep", model: null };

export function selectionKey(sel: SttSelection): string {
  return sel.engine === "keep" ? "keep" : `${sel.engine}:${sel.model ?? ""}`;
}

export function parseSelectionKey(key: string): SttSelection {
  if (key === "keep") return KEEP_SELECTION;
  const idx = key.indexOf(":");
  const engine = key.slice(0, idx);
  const model = key.slice(idx + 1);
  if ((engine === "whisper" || engine === "parakeet") && model) return { engine, model };
  return KEEP_SELECTION;
}

/**
 * The STT picker starts on the model the app is configured to use, provided
 * it can actually run right now; otherwise on "keep current transcript" so a
 * click never fails on a model that is not there.
 */
export function defaultSttSelection(
  settings: SttSettingsView,
  inventory: readonly RegenerateSttOption[],
  canRegenerateStt: boolean
): SttSelection {
  if (!canRegenerateStt) return KEEP_SELECTION;
  const wantsParakeet = settings.useLocalWhisper !== false && settings.localTranscriptionProvider === "nvidia";
  const preferred: SttSelection = wantsParakeet
    ? { engine: "parakeet", model: settings.parakeetModel ?? null }
    : { engine: "whisper", model: settings.whisperModel ?? null };
  const runnable = (s: SttSelection) =>
    inventory.some((i) => i.engine === s.engine && i.model === s.model && i.runnable);
  if (preferred.model && runnable(preferred)) return preferred;
  const anyRunnable = inventory.find((i) => i.runnable);
  return anyRunnable ? { engine: anyRunnable.engine, model: anyRunnable.model } : KEEP_SELECTION;
}

/** The cleanup picker starts on what live dictation would use. */
export function defaultCleanupChoice(ctx: CleanupContext): CleanupChoice {
  if (ctx.useReasoningModel === false) return "none";
  if (ctx.isCloud) return "cloud";
  if (ctx.effectiveModel && ctx.localModelIds.includes(ctx.effectiveModel)) {
    return `local:${ctx.effectiveModel}`;
  }
  return "none";
}

/** The model id ReasoningService.processText expects for a choice. */
export function cleanupChoiceModel(choice: CleanupChoice): string | null {
  if (choice === "none") return null;
  if (choice === "cloud") return "";
  return choice.slice("local:".length);
}

/** bf_entries.metadata reaches the renderer as a JSON string or an object. */
export function parseEntryMetadata(metadata: unknown): Record<string, unknown> {
  if (metadata == null) return {};
  if (typeof metadata === "object") return Array.isArray(metadata) ? {} : { ...(metadata as Record<string, unknown>) };
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export interface RegenerationHistoryItem {
  at?: string;
  rawText?: string | null;
  polished?: string | null;
  stt?: { engine?: string; model?: string | null } | null;
  cleanup?: { choice?: string; accepted?: boolean; reason?: string } | null;
}

export function regenerationHistory(metadata: unknown): RegenerationHistoryItem[] {
  const meta = parseEntryMetadata(metadata);
  return Array.isArray(meta.history) ? (meta.history as RegenerationHistoryItem[]) : [];
}

/** Short human label for what produced an entry's text ("SenseVoice · qwen3.5-4b"). */
export function describeProvenance(
  metadata: unknown,
  labels: { sttLabel?: (engine: string | undefined, model: string | null | undefined) => string | null }
): string | null {
  const meta = parseEntryMetadata(metadata);
  const stt = meta.stt as { engine?: string; model?: string | null; source?: string | null } | undefined;
  const cleanup = meta.cleanup as { choice?: string } | undefined;
  const parts: string[] = [];
  if (stt) {
    const label = labels.sttLabel?.(stt.engine ?? stt.source ?? undefined, stt.model) ?? stt.model ?? null;
    if (label) parts.push(label);
  }
  if (cleanup?.choice) {
    parts.push(
      cleanup.choice === "none" ? "no cleanup" : cleanup.choice === "cloud" ? "cloud cleanup" : cleanupChoiceModel(cleanup.choice as CleanupChoice) ?? cleanup.choice
    );
  }
  return parts.length ? parts.join(" · ") : null;
}
