/**
 * Voice Commands — Edit existing text by voice
 *
 * Detects when spoken text is a command (e.g., "make this more formal",
 * "translate to Spanish", "summarize this") and applies it to the
 * currently selected/clipboard text via Ollama.
 *
 * Competitive feature: Wispr Flow's "Command Mode", Voicy's AI voice commands.
 */

const debugLogger = require("../../helpers/debugLogger");

/**
 * Command patterns — if the transcribed text matches any of these,
 * it's treated as an edit command on the clipboard contents.
 *
 * Each pattern has:
 * - match: regex to test against the transcribed text (case-insensitive)
 * - buildPrompt: function(spokenText, selectedText) → system prompt for Ollama
 */
const COMMAND_PATTERNS = [
  // Rewrite / rephrase
  {
    id: "rewrite",
    match: /^(rewrite|rephrase|reword)\s+(this|that|it)?\s*/i,
    buildPrompt: (spoken, selected) => ({
      system: "Rewrite the following text. Keep the same meaning but use different wording. " +
        "Return ONLY the rewritten text, no explanations.\n" +
        extractInstructions(spoken, /^(rewrite|rephrase|reword)\s+(this|that|it)?\s*/i),
      user: selected,
    }),
  },

  // Shorten / make shorter (BEFORE generic "make" to catch "make this shorter")
  {
    id: "shorten",
    match: /^(shorten|make\s+(this|that|it)\s+shorter|condense|trim|cut\s+down)\s*/i,
    buildPrompt: (_spoken, selected) => ({
      system: "Shorten the following text while keeping the key information. " +
        "Be concise. Return ONLY the shortened text.",
      user: selected,
    }),
  },

  // Expand / elaborate (BEFORE generic "make" to catch "make this longer")
  {
    id: "expand",
    match: /^(expand|elaborate|make\s+(this|that|it)\s+(longer|more\s+detailed))\s*/i,
    buildPrompt: (spoken, selected) => ({
      system: "Expand and add more detail to the following text. " +
        "Keep the same tone and style. Return ONLY the expanded text.",
      user: selected,
    }),
  },

  // Simplify (BEFORE generic "make" to catch "make this simpler")
  {
    id: "simplify",
    match: /^(simplify|make\s+(this|that|it)\s+simpler|explain\s+(this|that|it)\s+simply)\s*/i,
    buildPrompt: (_spoken, selected) => ({
      system: "Simplify the following text. Use shorter sentences, simpler words, " +
        "and clearer structure. Return ONLY the simplified text.",
      user: selected,
    }),
  },

  // Make more formal / casual / professional / concise (generic — after specific "make X" patterns)
  {
    id: "make",
    match: /^make\s+(this|that|it)\s+/i,
    buildPrompt: (spoken, selected) => {
      const instruction = spoken.replace(/^make\s+(this|that|it)\s+/i, "").trim();
      return {
        system: `Rewrite the following text to be ${instruction}. ` +
          "Keep the core meaning. Return ONLY the rewritten text, no explanations.",
        user: selected,
      };
    },
  },

  // Translate
  {
    id: "translate",
    match: /^translate\s+(this|that|it)?\s*(to|into)\s+/i,
    buildPrompt: (spoken, selected) => {
      const langMatch = spoken.match(/(?:to|into)\s+(.+?)$/i);
      const language = langMatch ? langMatch[1].trim() : "English";
      return {
        system: `Translate the following text to ${language}. ` +
          "Return ONLY the translated text, no explanations.",
        user: selected,
      };
    },
  },

  // Summarize
  {
    id: "summarize",
    match: /^(summarize|summarise|sum up|give me a summary|tldr)\s*/i,
    buildPrompt: (_spoken, selected) => ({
      system: "Summarize the following text concisely. Keep the key points. " +
        "Return ONLY the summary, no explanations.",
      user: selected,
    }),
  },

  // Fix grammar / spelling
  {
    id: "fix",
    match: /^(fix|correct)\s+(the\s+)?(grammar|spelling|errors?|typos?|this|that|it)\s*/i,
    buildPrompt: (_spoken, selected) => ({
      system: "Fix all grammar, spelling, and punctuation errors in the following text. " +
        "Keep the meaning and style. Return ONLY the corrected text.",
      user: selected,
    }),
  },

  // Format as list / bullet points
  {
    id: "format-list",
    match: /^(format|convert|turn)\s+(this|that|it)?\s*(as|into|to)\s+(a\s+)?(list|bullet\s*points|bullets|numbered\s+list)\s*/i,
    buildPrompt: (_spoken, selected) => ({
      system: "Convert the following text into a clean bulleted list. " +
        "Each distinct point or item should be its own bullet. " +
        "Return ONLY the formatted list.",
      user: selected,
    }),
  },

  // Format as email
  {
    id: "format-email",
    match: /^(format|write|turn)\s+(this|that|it)?\s*(as|into)\s+(an?\s+)?email\s*/i,
    buildPrompt: (_spoken, selected) => ({
      system: "Format the following text as a professional email. " +
        "Add appropriate greeting, body structure, and sign-off. " +
        "Return ONLY the email text.",
      user: selected,
    }),
  },
];

/**
 * Extract additional instructions from the spoken text after removing the command prefix.
 */
function extractInstructions(spoken, prefixRegex) {
  const remaining = spoken.replace(prefixRegex, "").trim();
  return remaining ? `Additional instructions: ${remaining}` : "";
}

/**
 * Detect if the transcribed text is a voice edit command.
 * Returns the matched command or null.
 */
function detectCommand(transcribedText) {
  if (!transcribedText || transcribedText.length < 3) return null;

  const trimmed = transcribedText.trim();

  for (const pattern of COMMAND_PATTERNS) {
    if (pattern.match.test(trimmed)) {
      return {
        id: pattern.id,
        spoken: trimmed,
        buildPrompt: pattern.buildPrompt,
      };
    }
  }

  return null;
}

/**
 * Execute a voice edit command using Ollama.
 *
 * @param {string} spokenText - The transcribed voice command
 * @param {string} selectedText - The text to edit (from clipboard/selection)
 * @param {object} options - { baseUrl, model, timeoutMs }
 * @returns {{ success: boolean, text?: string, command?: string, error?: string }}
 */
async function executeVoiceCommand(spokenText, selectedText, options = {}) {
  const command = detectCommand(spokenText);

  if (!command) {
    return { success: false, error: "Not a recognized command", isCommand: false };
  }

  if (!selectedText || !selectedText.trim()) {
    return { success: false, error: "No text selected to edit", isCommand: true, command: command.id };
  }

  const baseUrl = options.baseUrl || "http://localhost:11434";
  const model = options.model || "llama3.2:1b";
  const timeoutMs = options.timeoutMs || 8000; // Longer timeout for edits

  const { system, user } = command.buildPrompt(command.spoken, selectedText);

  debugLogger.info("[WhisperWoof] Voice command detected", {
    command: command.id,
    spoken: spokenText.slice(0, 60),
    selectedLen: selectedText.length,
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
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 1024, // Allow longer output for edits
          top_p: 0.9,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      return { success: false, error: `Ollama HTTP ${response.status}`, isCommand: true, command: command.id };
    }

    const data = await response.json();
    const resultText = data?.message?.content?.trim() || "";

    if (!resultText) {
      return { success: false, error: "Empty response from Ollama", isCommand: true, command: command.id };
    }

    debugLogger.info("[WhisperWoof] Voice command completed", {
      command: command.id,
      inputLen: selectedText.length,
      outputLen: resultText.length,
    });

    return {
      success: true,
      text: resultText,
      isCommand: true,
      command: command.id,
    };
  } catch (err) {
    const message = err.name === "AbortError" ? "Timeout" : err.message;
    return { success: false, error: message, isCommand: true, command: command.id };
  }
}

/**
 * Get list of available voice commands (for help UI).
 */
function getAvailableCommands() {
  return COMMAND_PATTERNS.map(({ id, match }) => {
    // Extract a human-readable example from the regex
    const examples = {
      rewrite: "Rewrite this",
      make: "Make this more formal",
      translate: "Translate this to Spanish",
      summarize: "Summarize this",
      fix: "Fix the grammar",
      shorten: "Shorten this",
      expand: "Expand this",
      "format-list": "Format this as a list",
      "format-email": "Format this as an email",
      simplify: "Simplify this",
    };
    return { id, example: examples[id] || id };
  });
}

module.exports = {
  detectCommand,
  executeVoiceCommand,
  getAvailableCommands,
  COMMAND_PATTERNS,
};
