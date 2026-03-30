/**
 * Smart Reply — Speak a rough idea, get a full draft back
 *
 * Detects when the user is replying to something (context clues in their
 * speech) and generates a polished, tone-appropriate reply.
 *
 * Modes:
 * - email: formal structure (greeting, body, sign-off)
 * - slack: casual, concise, emoji-friendly
 * - comment: brief, direct (PR review, document feedback)
 * - general: adapts to the detected context-aware app
 *
 * Works with the context detector — Mail.app gets email mode,
 * Slack gets slack mode, VS Code gets comment mode.
 *
 * Competitor: Willow (auto-format replies), Fyxer (draft in your tone)
 */

const debugLogger = require("../../helpers/debugLogger");

// --- Reply detection ---

const REPLY_SIGNALS = [
  /\b(reply|respond|answer|write back|get back to)\b/i,
  /\b(tell (them|him|her|the team)|let (them|him|her) know)\b/i,
  /\b(say (that|yes|no|thanks)|sounds good|that works|I agree|I disagree)\b/i,
  /\b(email|message|slack|dm|text)\s+(them|him|her|back)\b/i,
  /\b(re:|regarding|about their|in response to)\b/i,
];

/**
 * Check if spoken text indicates a reply intent.
 */
function isReplyIntent(text) {
  if (!text || text.length < 5) return false;
  return REPLY_SIGNALS.some((p) => p.test(text));
}

// --- Reply prompts by mode ---

const REPLY_PROMPTS = {
  email: {
    id: "email",
    name: "Email Reply",
    prompt:
      "Draft a professional email reply based on the user's spoken instructions.\n\n" +
      "Rules:\n" +
      "- Start with an appropriate greeting (Hi/Hello + name if mentioned)\n" +
      "- Write the body in a professional but warm tone\n" +
      "- End with an appropriate sign-off (Best regards, Thanks, etc.)\n" +
      "- Keep it concise — 3-5 sentences for the body\n" +
      "- Preserve any specific details the user mentioned (names, dates, numbers)\n" +
      "- Return ONLY the email text, no explanations",
  },

  slack: {
    id: "slack",
    name: "Slack Message",
    prompt:
      "Draft a Slack message based on the user's spoken instructions.\n\n" +
      "Rules:\n" +
      "- Keep it casual and concise (1-3 sentences)\n" +
      "- Use natural, conversational tone\n" +
      "- It's OK to use common emoji sparingly if it fits\n" +
      "- No formal greetings or sign-offs\n" +
      "- Preserve specific details\n" +
      "- Return ONLY the message text",
  },

  comment: {
    id: "comment",
    name: "Code Review / Comment",
    prompt:
      "Draft a brief code review comment or document feedback.\n\n" +
      "Rules:\n" +
      "- Be direct and specific\n" +
      "- Use technical language where appropriate\n" +
      "- 1-2 sentences maximum\n" +
      "- If suggesting a change, be clear about what and why\n" +
      "- Return ONLY the comment text",
  },

  general: {
    id: "general",
    name: "General Reply",
    prompt:
      "Draft a reply based on the user's spoken instructions.\n\n" +
      "Rules:\n" +
      "- Match the formality to the context (casual for chat, formal for business)\n" +
      "- Keep it concise but complete\n" +
      "- Preserve specific details\n" +
      "- Return ONLY the reply text, no explanations",
  },
};

// --- App → reply mode mapping ---

const APP_REPLY_MODE = {
  "com.apple.mail": "email",
  "com.microsoft.Outlook": "email",
  "com.superhuman.electron": "email",
  "com.readdle.smartemail-macos": "email",
  "com.tinyspeck.slackmacgap": "slack",
  "com.hnc.Discord": "slack",
  "com.microsoft.teams2": "slack",
  "ru.keepcoder.Telegram": "slack",
  "com.microsoft.VSCode": "comment",
  "com.todesktop.230313mzl4w4u92": "comment",
  "com.apple.dt.Xcode": "comment",
  "dev.zed.Zed": "comment",
};

/**
 * Get the reply mode for an app.
 */
function getReplyMode(bundleId) {
  return APP_REPLY_MODE[bundleId] || "general";
}

/**
 * Draft a reply using LLM.
 *
 * @param {string} spokenText - What the user said
 * @param {object} options - { mode, bundleId, baseUrl, model, timeoutMs }
 */
async function draftReply(spokenText, options = {}) {
  const mode = options.mode || (options.bundleId ? getReplyMode(options.bundleId) : "general");
  const promptConfig = REPLY_PROMPTS[mode] || REPLY_PROMPTS.general;
  const baseUrl = options.baseUrl || "http://localhost:11434";
  const model = options.model || "llama3.2:1b";
  const timeoutMs = options.timeoutMs || 8000;

  debugLogger.info("[WhisperWoof] Smart reply drafting", { mode, inputLen: spokenText.length });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: promptConfig.prompt },
          { role: "user", content: spokenText },
        ],
        stream: false,
        options: { temperature: 0.3, num_predict: 512, top_p: 0.9 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, mode };
    }

    const data = await response.json();
    const draft = data?.message?.content?.trim() || "";

    if (!draft) {
      return { success: false, error: "Empty response", mode };
    }

    return { success: true, draft, mode, inputLen: spokenText.length, outputLen: draft.length };
  } catch (err) {
    const message = err.name === "AbortError" ? "Timeout" : err.message;
    return { success: false, error: message, mode };
  }
}

/**
 * Get available reply modes (for settings UI).
 */
function getReplyModes() {
  return Object.values(REPLY_PROMPTS).map(({ id, name }) => ({ id, name }));
}

module.exports = {
  isReplyIntent,
  getReplyMode,
  draftReply,
  getReplyModes,
  REPLY_PROMPTS,
  APP_REPLY_MODE,
  REPLY_SIGNALS,
};
