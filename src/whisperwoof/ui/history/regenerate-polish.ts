/**
 * Cleanup for a regenerated transcript — the same pipeline live dictation
 * runs (audioManager._cleanupTranscription), minus the 25-char skip and the
 * 3s timeout: the user asked for this run explicitly and watches a progress
 * state instead.
 *
 * Renderer-only (ESM). Never import src/whisperwoof/bridge/*.js from here.
 */
import ReasoningService from "../../../services/ReasoningService";
import { guardPolishedOutput } from "../../core/polish/polish-output-guard";
import { normalizeCjkPunctuation } from "../../core/language/normalize-cjk-punctuation";
import { cleanupChoiceModel, type CleanupChoice } from "./regenerate-selections";

export interface RegeneratePolishResult {
  /** Text to store as `polished`; null when cleanup was off or changed nothing. */
  polished: string | null;
  accepted: boolean;
  reason?: string;
  detail?: string;
}

export async function polishForRegeneration(
  rawText: string,
  choice: CleanupChoice
): Promise<RegeneratePolishResult> {
  const model = cleanupChoiceModel(choice);
  if (model === null) return { polished: null, accepted: false, reason: "off" };

  const agentName =
    typeof window !== "undefined" && window.localStorage
      ? window.localStorage.getItem("agentName") || null
      : null;
  const output = (await ReasoningService.processText(rawText, model, agentName)) ?? "";
  const guarded = guardPolishedOutput(rawText, output.trim());
  if (!guarded.accepted) {
    return { polished: null, accepted: false, reason: guarded.reason, detail: guarded.detail };
  }
  const polished = normalizeCjkPunctuation(guarded.text);
  return { polished: polished !== rawText ? polished : null, accepted: true };
}
