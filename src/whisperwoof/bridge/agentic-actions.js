/**
 * Agentic Actions — Voice-triggered app actions via MCP plugins
 *
 * Detects action intent from voice and routes to the appropriate MCP
 * plugin with structured parameters extracted by LLM.
 *
 * Examples:
 *   "Schedule a meeting with Sarah for Friday at 3pm"
 *     → calendar plugin: create_event({ title, attendees, date, time })
 *
 *   "Send a Slack message to the team: we're shipping today"
 *     → slack plugin: send_message({ channel: "team", text })
 *
 *   "Add a task to buy groceries by tomorrow"
 *     → todoist plugin: add_task({ content, due_date })
 *
 *   "Create a Notion page with today's meeting notes"
 *     → notion plugin: create_page({ title, text })
 *
 * Competitor: VoiceOS (Calendar/Gmail/Slack integrations),
 * Alter (Mac-wide AI layer that acts on apps).
 */

const debugLogger = require("../../helpers/debugLogger");

// --- Action intent detection ---

const ACTION_PATTERNS = [
  {
    id: "calendar",
    plugin: "calendar",
    patterns: [
      /\b(schedule|book|set up|create)\s+(an?\s+)?(meeting|call|event|appointment)\b/i,
      /\b(add|put)\s+(.*?)\s+(on|to)\s+(my\s+)?(calendar|schedule)\b/i,
      /\b(block|reserve)\s+(time|my calendar)\b/i,
    ],
    tool: "create_event",
    label: "Create calendar event",
  },
  {
    id: "slack",
    plugin: "slack",
    patterns: [
      /\b(send|post)\s+(an?\s+)?(slack\s+message|message)\s+(to|in)\b/i,
      /\b(message|dm|ping)\s+(the team|channel|#\w+|\w+)\s+(on\s+)?slack\b/i,
      /\b(slack)\s+(the team|channel|\w+)\b/i,
    ],
    tool: "send_message",
    label: "Send Slack message",
  },
  {
    id: "todoist",
    plugin: "todoist",
    patterns: [
      /\b(add|create)\s+(a\s+)?(task|todo|to-do|reminder)\b/i,
      /\b(remind me to|don't forget to|need to)\b/i,
      /\b(put|add)\s+(.*?)\s+(on|to)\s+(my\s+)?(todo|task)\s*(list)?\b/i,
    ],
    tool: "add_task",
    label: "Add task to Todoist",
  },
  {
    id: "notion",
    plugin: "notion",
    patterns: [
      /\b(create|make|add)\s+(a\s+)?(notion|page|doc|document|note)\s*(in\s+notion)?\b/i,
      /\b(save|write)\s+(this|that|it)\s+(to|in)\s+notion\b/i,
    ],
    tool: "create_page",
    label: "Create Notion page",
  },
  {
    id: "email",
    plugin: "email",
    patterns: [
      /\b(send|write|draft)\s+(an?\s+)?email\s+(to)\b/i,
      /\b(email)\s+(\w+)\s+(about|regarding|that)\b/i,
    ],
    tool: "send_email",
    label: "Send email",
  },
];

/**
 * Detect if spoken text has an agentic action intent.
 * Returns the matched action or null.
 */
function detectActionIntent(text) {
  if (!text || text.length < 8) return null;
  const trimmed = text.trim();

  for (const action of ACTION_PATTERNS) {
    for (const pattern of action.patterns) {
      if (pattern.test(trimmed)) {
        return {
          id: action.id,
          plugin: action.plugin,
          tool: action.tool,
          label: action.label,
          spokenText: trimmed,
        };
      }
    }
  }

  return null;
}

// --- Parameter extraction via LLM ---

const EXTRACT_PARAMS_PROMPT =
  "You are a voice command parser. Extract structured parameters from the user's spoken request.\n\n" +
  "Rules:\n" +
  "- Return ONLY valid JSON, no explanations\n" +
  "- Extract: who (names/attendees), what (title/content), when (date/time), where (channel/location)\n" +
  "- For dates: use ISO 8601 (2026-03-31) or relative ('tomorrow', 'Friday')\n" +
  "- For times: use 24h format (15:00) or 12h ('3pm')\n" +
  "- Omit fields that aren't mentioned\n\n" +
  "Example input: 'Schedule a meeting with Sarah for Friday at 3pm to discuss the budget'\n" +
  'Example output: {"title":"Discuss the budget","attendees":["Sarah"],"date":"Friday","time":"3pm"}';

/**
 * Extract structured parameters from spoken text via LLM.
 */
async function extractActionParams(spokenText, actionId, options = {}) {
  const baseUrl = options.baseUrl || "http://localhost:11434";
  const model = options.model || "llama3.2:1b";
  const timeoutMs = options.timeoutMs || 8000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: EXTRACT_PARAMS_PROMPT },
          { role: "user", content: `Action type: ${actionId}\nUser said: "${spokenText}"` },
        ],
        stream: false,
        options: { temperature: 0.1, num_predict: 256, top_p: 0.9 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const raw = data?.message?.content?.trim() || "{}";

    // Parse JSON from LLM response (may have markdown fences)
    const jsonStr = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();

    try {
      const params = JSON.parse(jsonStr);
      return { success: true, params };
    } catch {
      return { success: false, error: "Failed to parse LLM response as JSON", raw };
    }
  } catch (err) {
    return { success: false, error: err.name === "AbortError" ? "Timeout" : err.message };
  }
}

/**
 * Full agentic action pipeline: detect → extract params → return ready-to-execute action.
 *
 * Does NOT execute the MCP call — returns the action for the caller to dispatch
 * via PluginManager. This keeps the agentic layer pure and testable.
 */
async function prepareAction(spokenText, options = {}) {
  const intent = detectActionIntent(spokenText);
  if (!intent) {
    return { success: false, isAction: false };
  }

  debugLogger.info("[WhisperWoof] Agentic action detected", {
    action: intent.id,
    plugin: intent.plugin,
  });

  const extraction = await extractActionParams(spokenText, intent.id, options);
  if (!extraction.success) {
    return { success: false, isAction: true, action: intent, error: extraction.error };
  }

  return {
    success: true,
    isAction: true,
    action: {
      ...intent,
      params: extraction.params,
    },
  };
}

/**
 * Get available agentic actions (for help/UI).
 */
function getAvailableActions() {
  return ACTION_PATTERNS.map(({ id, plugin, label }) => ({ id, plugin, label }));
}

module.exports = {
  detectActionIntent,
  extractActionParams,
  prepareAction,
  getAvailableActions,
  ACTION_PATTERNS,
};
