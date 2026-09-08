/**
 * Script mix of a transcript — which writing systems the speaker used.
 *
 * Used to append a one-line, input-specific language hint to the END of the
 * cleanup prompt ("the input mixes Chinese and English: keep both"). A
 * generic "never translate" rule at the top of the prompt is already there;
 * small local models follow a concrete statement about THIS input far more
 * reliably than a general rule. The hint goes at the end on purpose:
 * llama-server reuses the KV cache for the longest common prefix of the
 * previous prompt, so anything inserted before the fixed prompt would force
 * a full re-prefill (500-900 tokens) on every dictation.
 */

import hints from "./script-mix-hints.json";

export type ScriptMix = "zh" | "en" | "mixed" | "none";

const HAN_RE = /[一-鿿㐀-䶿]/g;
const LATIN_RE = /[a-zA-Z]/g;

export function countScripts(text: string): { han: number; latin: number } {
  const t = typeof text === "string" ? text : "";
  return {
    han: (t.match(HAN_RE) || []).length,
    latin: (t.match(LATIN_RE) || []).length,
  };
}

export function describeScriptMix(text: string): ScriptMix {
  const { han, latin } = countScripts(text);
  if (han === 0 && latin === 0) return "none";
  if (han === 0) return "en";
  // A single stray Latin letter inside Chinese ("A 计划", "3D") is not a
  // second language; anything more is code-switching worth naming.
  if (latin < 2) return "zh";
  return "mixed";
}

/**
 * Bilingual so it lands whichever locale's cleanup prompt is active (the
 * prompt is chosen by UI language, not by what was spoken). Kept in JSON so
 * eval/run-polish-eval.js (CommonJS) sends the exact production text.
 */
export const SCRIPT_MIX_HINTS: Record<ScriptMix, string> = hints as Record<ScriptMix, string>;

export function scriptMixHint(text: string): string {
  return SCRIPT_MIX_HINTS[describeScriptMix(text)];
}
