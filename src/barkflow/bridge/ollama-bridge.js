/**
 * Ollama Bridge — Main process bridge for BarkFlow's Ollama polish
 *
 * Provides a simple interface for the IPC handler to call Ollama
 * for text polishing. Falls back to raw text on any failure.
 */

const debugLogger = require("../../helpers/debugLogger");

const { getPresetPrompt, DEFAULT_PRESET_ID } = require("./polish-presets");

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.2:1b";
const DEFAULT_TIMEOUT_MS = 5000;

async function polishWithOllama(text, options = {}) {
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
  const model = options.model || DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const presetId = options.preset || DEFAULT_PRESET_ID;
  const systemPrompt = getPresetPrompt(presetId);

  // Security: only allow localhost Ollama URLs (prevent SSRF)
  try {
    const parsedUrl = new URL(baseUrl);
    if (!["localhost", "127.0.0.1"].includes(parsedUrl.hostname)) {
      return { success: true, text, polished: false, error: "Ollama URL must be localhost" };
    }
  } catch {
    return { success: true, text, polished: false, error: "Invalid Ollama URL" };
  }

  if (!text || !text.trim()) {
    return { success: true, text: text || "", polished: false };
  }

  const startTime = Date.now();

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
        options: {
          temperature: 0.2,      // Low temp for predictable cleanup
          num_predict: 512,      // Keep response short for speed
          top_p: 0.9,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      debugLogger.warn("[BarkFlow] Ollama returned HTTP " + response.status);
      return { success: true, text, polished: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const polishedText =
      data?.message?.content?.trim() || "";

    if (!polishedText) {
      return { success: true, text, polished: false, error: "Empty response" };
    }

    const elapsed = Date.now() - startTime;
    debugLogger.info("[BarkFlow] Ollama polish completed", {
      model,
      elapsed,
      inputLen: text.length,
      outputLen: polishedText.length,
    });

    return { success: true, text: polishedText, polished: true, elapsed };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    const message = err.name === "AbortError" ? "Timeout" : err.message;
    debugLogger.warn("[BarkFlow] Ollama polish failed, using raw text", {
      error: message,
      elapsed,
    });
    return { success: true, text, polished: false, error: message };
  }
}

async function checkOllamaAvailable(baseUrl = DEFAULT_BASE_URL) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) return { available: false, models: [] };

    const data = await response.json();
    const models = (data.models || [])
      .map((m) => m.name)
      .filter(Boolean);

    return { available: true, models };
  } catch {
    return { available: false, models: [] };
  }
}

module.exports = { polishWithOllama, checkOllamaAvailable };
