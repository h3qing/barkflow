/**
 * Backtrack Correction — Intelligent mid-sentence self-correction
 *
 * When a user says "Let's meet tomorrow, no wait, Friday instead",
 * the output should be "Let's meet Friday" — not the literal transcript.
 *
 * Wispr Flow's standout feature. WhisperWoof implements this as a
 * pre-polish pass that detects self-corrections and rewrites them
 * before the main polish step.
 *
 * Detection approach:
 * 1. Regex-based: catch explicit correction phrases
 * 2. LLM-based: for ambiguous cases, send to Ollama with a specialized prompt
 */

const debugLogger = require("../../helpers/debugLogger");

/**
 * Correction signal phrases — when these appear in a transcript,
 * the speaker is correcting what they just said.
 */
const CORRECTION_SIGNALS = [
  // Explicit corrections
  /\b(no wait|no,?\s*wait|actually,?\s*(no|wait|change|make))/i,
  /\b(I mean|I meant|sorry,?\s*I meant?)/i,
  /\b(correction|let me correct that|let me rephrase)/i,
  /\b(scratch that|strike that|delete that|forget that|never mind)/i,
  /\b(not .{1,30},?\s*(but|rather|instead))/i,
  /\b(change that to|replace .{1,30} with|instead of .{1,30},?\s*(say|use|make it))/i,

  // Repetition with change (speaker restarts a phrase differently)
  /\b(or rather|or actually|well actually)/i,
  /\b(wait,?\s*(no|let me)|hold on,?\s*(let me|actually))/i,
];

/**
 * Check if a transcript contains self-correction signals.
 * Returns the matched signals or empty array.
 */
function detectBacktrack(text) {
  if (!text || text.length < 10) return [];

  const matches = [];
  for (const pattern of CORRECTION_SIGNALS) {
    const match = text.match(pattern);
    if (match) {
      matches.push({
        signal: match[0],
        index: match.index,
        pattern: pattern.source,
      });
    }
  }

  return matches;
}

/**
 * Check if transcript has any backtrack signals.
 */
function hasBacktrack(text) {
  return detectBacktrack(text).length > 0;
}

/**
 * Build a system prompt for backtrack-aware polishing.
 * This prompt tells the LLM to resolve self-corrections
 * rather than transcribing them literally.
 */
const BACKTRACK_PROMPT =
  "You are a voice transcript editor. The speaker corrected themselves mid-sentence. " +
  "Your job is to produce the FINAL INTENDED text, not the literal transcript.\n\n" +
  "Rules:\n" +
  '- When the speaker says "no wait", "actually", "I mean", "scratch that", "change that to", ' +
  "or similar correction phrases, APPLY the correction and remove the backtrack.\n" +
  '- "Let\'s meet tomorrow, no wait, Friday instead" → "Let\'s meet Friday"\n' +
  '- "Send it to John, actually send it to Sarah" → "Send it to Sarah"\n' +
  '- "The budget is ten thousand, sorry I meant twelve thousand" → "The budget is twelve thousand"\n' +
  '- "Buy milk and eggs, scratch that, just milk" → "Buy milk"\n' +
  "- Remove ALL filler words, hesitations, and correction phrases\n" +
  "- Keep proper punctuation and capitalization\n" +
  "- Return ONLY the final corrected text, no explanations\n" +
  "- If there's no correction, just clean up the text normally";

/**
 * Apply backtrack correction to a transcript using Ollama.
 * This runs BEFORE the normal polish step.
 *
 * @param {string} text - Raw transcript with potential self-corrections
 * @param {object} options - { baseUrl, model, timeoutMs }
 * @returns {{ text: string, corrected: boolean, signals: string[] }}
 */
async function applyBacktrackCorrection(text, options = {}) {
  const signals = detectBacktrack(text);

  // No correction signals → return as-is (skip LLM call)
  if (signals.length === 0) {
    return { text, corrected: false, signals: [] };
  }

  const baseUrl = options.baseUrl || "http://localhost:11434";
  const model = options.model || "llama3.2:1b";
  const timeoutMs = options.timeoutMs || 5000;

  debugLogger.info("[WhisperWoof] Backtrack detected", {
    signals: signals.map((s) => s.signal),
    inputLen: text.length,
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: BACKTRACK_PROMPT },
          { role: "user", content: text },
        ],
        stream: false,
        options: { temperature: 0.1, num_predict: 512, top_p: 0.9 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      return { text, corrected: false, signals: signals.map((s) => s.signal), error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const correctedText = data?.message?.content?.trim() || "";

    if (!correctedText) {
      return { text, corrected: false, signals: signals.map((s) => s.signal), error: "Empty response" };
    }

    debugLogger.info("[WhisperWoof] Backtrack correction applied", {
      inputLen: text.length,
      outputLen: correctedText.length,
      signals: signals.map((s) => s.signal),
    });

    return {
      text: correctedText,
      corrected: true,
      signals: signals.map((s) => s.signal),
    };
  } catch (err) {
    const message = err.name === "AbortError" ? "Timeout" : err.message;
    debugLogger.warn("[WhisperWoof] Backtrack correction failed", { error: message });
    return { text, corrected: false, signals: signals.map((s) => s.signal), error: message };
  }
}

module.exports = {
  detectBacktrack,
  hasBacktrack,
  applyBacktrackCorrection,
  BACKTRACK_PROMPT,
  CORRECTION_SIGNALS,
};
