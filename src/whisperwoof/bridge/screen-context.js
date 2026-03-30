/**
 * Screen Context — Read selected text and visible content for voice commands
 *
 * Reads the currently selected text (or focused text field content) from
 * the active app via macOS Accessibility API. Enables commands like:
 *
 *   "Summarize this" → reads selected text → summarizes via LLM
 *   "Explain this" → reads selected text → explains in simple terms
 *   "Reply to this" → reads selected text → drafts a reply
 *
 * Competitors: Typeless (interact with read-only text), Aqua Voice
 * (screen context), Alter (window/app awareness).
 *
 * Uses the same NSWorkspace + AXUIElement approach as textEditMonitor.
 */

const { execFile } = require("child_process");
const debugLogger = require("../../helpers/debugLogger");

// --- Read selected text via macOS Accessibility ---

/**
 * JXA script to get the selected text from the frontmost app.
 * Uses AXSelectedText attribute from the focused UI element.
 */
const GET_SELECTED_TEXT_SCRIPT = `
ObjC.import("AppKit");
ObjC.import("ApplicationServices");

const app = $.NSWorkspace.sharedWorkspace.frontmostApplication;
const pid = app.processIdentifier;

const appRef = Ref();
const err = $.AXUIElementCreateApplication(pid);
const focused = Ref();
$.AXUIElementCopyAttributeValue(err, "AXFocusedUIElement", focused);

if (focused[0]) {
  const selectedText = Ref();
  const result = $.AXUIElementCopyAttributeValue(focused[0], "AXSelectedText", selectedText);
  if (result === 0 && selectedText[0]) {
    ObjC.unwrap(selectedText[0]);
  } else {
    "";
  }
} else {
  "";
}
`;

/**
 * Get the currently selected text from the frontmost application.
 * Returns the selected text string or null on failure.
 *
 * Requires Accessibility permissions (same as paste functionality).
 */
function getSelectedText() {
  if (process.platform !== "darwin") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    execFile(
      "osascript",
      ["-l", "JavaScript", "-e", GET_SELECTED_TEXT_SCRIPT],
      { timeout: 3000 },
      (err, stdout) => {
        if (err) {
          debugLogger.debug("[WhisperWoof] getSelectedText failed", { error: err.message });
          resolve(null);
          return;
        }
        const text = stdout.trim();
        resolve(text || null);
      }
    );
  });
}

// --- Screen context commands ---

/**
 * Commands that operate on screen context (selected text).
 * Each command takes the selected text and produces a result via LLM.
 */
const SCREEN_COMMANDS = {
  summarize: {
    id: "summarize",
    trigger: /^(summarize|sum up|give me a summary of)\s+(this|that|the selection|what's selected)\s*$/i,
    prompt: "Summarize the following text concisely in 2-3 sentences. Return ONLY the summary.",
    label: "Summarize selection",
  },
  explain: {
    id: "explain",
    trigger: /^(explain|what does this mean|break this down|help me understand)\s*(this|that|the selection)?\s*$/i,
    prompt: "Explain the following text in simple terms. Use short sentences. Return ONLY the explanation.",
    label: "Explain selection",
  },
  reply: {
    id: "reply",
    trigger: /^(reply to|respond to|answer)\s+(this|that|the selection)\s*$/i,
    prompt: "Draft a reply to the following message. Keep it concise and professional. Return ONLY the reply.",
    label: "Reply to selection",
  },
  translate: {
    id: "translate",
    trigger: /^translate\s+(this|that|the selection)\s*$/i,
    prompt: "Translate the following text to English. If already in English, translate to Spanish. Return ONLY the translation.",
    label: "Translate selection",
  },
  simplify: {
    id: "simplify",
    trigger: /^(simplify|make this simpler|dumb this down)\s*$/i,
    prompt: "Rewrite the following text using simpler words and shorter sentences. Return ONLY the simplified version.",
    label: "Simplify selection",
  },
  bullets: {
    id: "bullets",
    trigger: /^(turn this into|convert to|make)\s*(bullet points|a list|bullets)\s*$/i,
    prompt: "Convert the following text into a clean bullet-point list. Return ONLY the bullet points.",
    label: "Convert to bullets",
  },
};

/**
 * Detect if spoken text is a screen context command.
 */
function detectScreenCommand(spokenText) {
  if (!spokenText || spokenText.length < 5) return null;
  const trimmed = spokenText.trim();

  for (const [id, cmd] of Object.entries(SCREEN_COMMANDS)) {
    if (cmd.trigger.test(trimmed)) {
      return { id, prompt: cmd.prompt, label: cmd.label };
    }
  }
  return null;
}

/**
 * Execute a screen context command: read selection + LLM transform.
 *
 * @param {string} commandId - One of SCREEN_COMMANDS keys
 * @param {string} selectedText - The text to operate on (or null to auto-read)
 * @param {object} options - { baseUrl, model, timeoutMs }
 */
async function executeScreenCommand(commandId, selectedText, options = {}) {
  const command = SCREEN_COMMANDS[commandId];
  if (!command) return { success: false, error: `Unknown command: ${commandId}` };

  // If no text provided, try reading from screen
  let text = selectedText;
  if (!text) {
    text = await getSelectedText();
  }

  if (!text || !text.trim()) {
    return { success: false, error: "No text selected. Select text first, then speak the command." };
  }

  const baseUrl = options.baseUrl || "http://localhost:11434";
  const model = options.model || "llama3.2:1b";
  const timeoutMs = options.timeoutMs || 10000;

  debugLogger.info("[WhisperWoof] Screen command executing", {
    command: commandId,
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
          { role: "system", content: command.prompt },
          { role: "user", content: text.slice(0, 3000) },
        ],
        stream: false,
        options: { temperature: 0.3, num_predict: 1024, top_p: 0.9 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, command: commandId };
    }

    const data = await response.json();
    const result = data?.message?.content?.trim() || "";

    if (!result) {
      return { success: false, error: "Empty response", command: commandId };
    }

    return { success: true, result, command: commandId, inputLen: text.length, outputLen: result.length };
  } catch (err) {
    const message = err.name === "AbortError" ? "Timeout" : err.message;
    return { success: false, error: message, command: commandId };
  }
}

/**
 * Get available screen commands (for help/UI).
 */
function getScreenCommands() {
  return Object.values(SCREEN_COMMANDS).map(({ id, label }) => ({ id, label }));
}

module.exports = {
  getSelectedText,
  detectScreenCommand,
  executeScreenCommand,
  getScreenCommands,
  SCREEN_COMMANDS,
};
