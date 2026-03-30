/**
 * Intent Capture — "Capture what I meant" mode
 *
 * Goes beyond polish: restructures rambling, thinking-out-loud speech
 * into a clear, actionable statement of intent.
 *
 * Input:  "so basically I was thinking we should probably maybe look into,
 *          you know, changing the deployment to happen on Fridays instead
 *          of Mondays because of the release schedule"
 * Output: "Change deployment schedule from Monday to Friday to align with
 *          the release cycle."
 *
 * Features:
 * 1. Rambling detection — identify when speech needs intent extraction
 * 2. Intent extraction — LLM prompt that distills the core message
 * 3. Output modes — action item, decision, question, note
 *
 * Competitor: DictaFlow "Think Out Loud" mode, Ito intent capture.
 */

const debugLogger = require("../../helpers/debugLogger");

// --- Rambling detection ---

/**
 * Heuristics that indicate rambling / thinking-out-loud speech.
 * The more signals present, the higher the rambling score.
 */
const RAMBLING_SIGNALS = {
  // Hedging / uncertainty
  hedging: /\b(probably|maybe|I think|I guess|kind of|sort of|I feel like|I suppose|perhaps|might|could be)\b/gi,

  // Filler density (high ratio of filler to content)
  fillers: /\b(um|uh|like|you know|basically|actually|so|right|I mean|well|okay so|anyway)\b/gi,

  // False starts / restarts
  restarts: /\b(no wait|actually|I mean|or rather|well actually|let me think|hmm|let me rephrase)\b/gi,

  // Tangents / digressions
  tangents: /\b(by the way|speaking of|on a side note|oh and also|which reminds me|come to think of it)\b/gi,

  // Excessive connectors without progress
  wandering: /\b(and then|but also|and also|but anyway|so anyway|and I was thinking|but the thing is)\b/gi,

  // Repetition (same phrase structure repeated)
  repetition: /\b(the thing is|the point is|what I'm saying is|what I mean is)\b/gi,
};

/**
 * Calculate a rambling score (0-1) for a text.
 * Higher score = more rambling detected.
 *
 * @param {string} text
 * @returns {{ score: number, signals: Record<string, number>, isRambling: boolean }}
 */
function detectRambling(text) {
  if (!text || text.length < 30) {
    return { score: 0, signals: {}, isRambling: false };
  }

  const wordCount = text.split(/\s+/).length;
  const signals = {};
  let totalHits = 0;

  for (const [name, pattern] of Object.entries(RAMBLING_SIGNALS)) {
    const matches = text.match(pattern) || [];
    signals[name] = matches.length;
    totalHits += matches.length;
  }

  // Score = signal density (hits per word), capped at 1
  const density = totalHits / wordCount;
  const score = Math.min(1, density * 3); // Scale: 0.33 hits/word = score 1.0

  // Also check text length — very long single utterances are more likely rambling
  const lengthBonus = wordCount > 40 ? 0.1 : 0;
  const finalScore = Math.min(1, score + lengthBonus);

  return {
    score: Math.round(finalScore * 100) / 100,
    signals,
    isRambling: finalScore >= 0.25, // Threshold: 25% rambling density
  };
}

// --- Intent extraction prompts ---

/**
 * Output modes for intent capture.
 */
const OUTPUT_MODES = {
  auto: {
    id: "auto",
    name: "Auto-detect",
    description: "Automatically determine if the intent is an action, decision, question, or note",
    prompt:
      "You are an intent extraction assistant. The user was thinking out loud. " +
      "Extract their CORE INTENT — what they actually want to communicate.\n\n" +
      "Rules:\n" +
      "- Remove ALL rambling, hedging, filler words, false starts, tangents\n" +
      "- Identify the type: ACTION (something to do), DECISION (something decided), " +
      "QUESTION (something to ask), or NOTE (something to remember)\n" +
      "- Restructure into 1-3 clear, direct sentences\n" +
      "- If there are multiple intents, separate them with bullet points\n" +
      "- Preserve specific details (names, dates, numbers, locations)\n" +
      "- Use active voice and strong verbs\n" +
      "- Return ONLY the extracted intent, no labels or explanations",
  },

  action: {
    id: "action",
    name: "Action Item",
    description: "Extract as a clear to-do / action item",
    prompt:
      "Extract the action item from this rambling voice note. " +
      "Rules: Start with a verb. Be specific. Include who, what, when if mentioned. " +
      "Remove all filler, hedging, and tangents. One clear sentence. " +
      "Return ONLY the action item.",
  },

  decision: {
    id: "decision",
    name: "Decision",
    description: "Extract as a clear decision statement",
    prompt:
      "Extract the decision from this rambling voice note. " +
      "Rules: State the decision directly. Include the reasoning in one sentence if clear. " +
      "Remove all uncertainty language — the user has decided. " +
      "Return ONLY the decision statement.",
  },

  question: {
    id: "question",
    name: "Question",
    description: "Extract as a clear question to ask someone",
    prompt:
      "Extract the question from this rambling voice note. " +
      "Rules: Formulate a clear, direct question. Include context if needed. " +
      "Remove all filler and thinking-out-loud language. " +
      "Return ONLY the question.",
  },

  summary: {
    id: "summary",
    name: "Summary",
    description: "Summarize the key points from rambling thoughts",
    prompt:
      "Summarize the key points from this rambling voice note. " +
      "Rules: Extract 2-5 bullet points of the core ideas. " +
      "Remove all filler, hedging, and tangents. Be concise. " +
      "Return ONLY the bullet points.",
  },
};

/**
 * Get the intent extraction prompt for a given mode.
 */
function getIntentPrompt(mode = "auto") {
  const config = OUTPUT_MODES[mode];
  return config ? config.prompt : OUTPUT_MODES.auto.prompt;
}

/**
 * Get available output modes (for settings UI).
 */
function getOutputModes() {
  return Object.values(OUTPUT_MODES).map(({ id, name, description }) => ({
    id, name, description,
  }));
}

/**
 * Extract intent from rambling text using LLM.
 *
 * @param {string} text - The rambling transcript
 * @param {object} options - { mode, baseUrl, model, timeoutMs }
 * @returns {{ text: string, mode: string, ramblingScore: number, extracted: boolean }}
 */
async function extractIntent(text, options = {}) {
  const mode = options.mode || "auto";
  const baseUrl = options.baseUrl || "http://localhost:11434";
  const model = options.model || "llama3.2:1b";
  const timeoutMs = options.timeoutMs || 8000;

  const ramblingResult = detectRambling(text);

  // If not rambling enough, just return cleaned text (normal polish is better)
  if (!ramblingResult.isRambling) {
    return {
      text,
      mode,
      ramblingScore: ramblingResult.score,
      extracted: false,
    };
  }

  const systemPrompt = getIntentPrompt(mode);

  debugLogger.info("[WhisperWoof] Intent capture triggered", {
    mode,
    ramblingScore: ramblingResult.score,
    signals: ramblingResult.signals,
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
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        stream: false,
        options: { temperature: 0.2, num_predict: 512, top_p: 0.9 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      return { text, mode, ramblingScore: ramblingResult.score, extracted: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const extracted = data?.message?.content?.trim() || "";

    if (!extracted) {
      return { text, mode, ramblingScore: ramblingResult.score, extracted: false, error: "Empty response" };
    }

    debugLogger.info("[WhisperWoof] Intent extracted", {
      mode,
      inputLen: text.length,
      outputLen: extracted.length,
      compressionRatio: Math.round((1 - extracted.length / text.length) * 100) + "%",
    });

    return {
      text: extracted,
      mode,
      ramblingScore: ramblingResult.score,
      extracted: true,
    };
  } catch (err) {
    const message = err.name === "AbortError" ? "Timeout" : err.message;
    return { text, mode, ramblingScore: ramblingResult.score, extracted: false, error: message };
  }
}

module.exports = {
  detectRambling,
  extractIntent,
  getIntentPrompt,
  getOutputModes,
  RAMBLING_SIGNALS,
  OUTPUT_MODES,
};
