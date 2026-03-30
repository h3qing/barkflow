/**
 * Ollama Bridge — Main process bridge for WhisperWoof's Ollama polish
 *
 * Provides a simple interface for the IPC handler to call Ollama
 * for text polishing. Falls back to raw text on any failure.
 */

const debugLogger = require("../../helpers/debugLogger");

const { getPresetPrompt, DEFAULT_PRESET_ID } = require("./polish-presets");
const { detectContextPreset } = require("./context-detector");

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.2:1b";
const DEFAULT_TIMEOUT_MS = 5000;

async function polishWithOllama(text, options = {}) {
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
  const model = options.model || DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const customPrompt = options.customPrompt || "";

  // Context-aware preset: if user hasn't explicitly set a preset and
  // contextAware is enabled, auto-detect based on frontmost app.
  let presetId = options.preset || null;
  let detectedApp = null;

  if (!presetId && options.contextAware !== false) {
    try {
      const context = await detectContextPreset();
      if (context.preset) {
        presetId = context.preset;
        detectedApp = context.app;
        debugLogger.debug("[WhisperWoof] Context-aware preset selected", {
          app: detectedApp?.name,
          preset: presetId,
        });
      }
    } catch {
      // Detection failed — fall back to default
    }
  }

  presetId = presetId || DEFAULT_PRESET_ID;
  const basePrompt = getPresetPrompt(presetId);
  // Append custom instructions if user has set them
  const systemPrompt = customPrompt
    ? `${basePrompt}\n\nAdditional instructions from user:\n${customPrompt}`
    : basePrompt;

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
      debugLogger.warn("[WhisperWoof] Ollama returned HTTP " + response.status);
      return { success: true, text, polished: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const polishedText =
      data?.message?.content?.trim() || "";

    if (!polishedText) {
      return { success: true, text, polished: false, error: "Empty response" };
    }

    const elapsed = Date.now() - startTime;
    debugLogger.info("[WhisperWoof] Ollama polish completed", {
      model,
      elapsed,
      inputLen: text.length,
      outputLen: polishedText.length,
    });

    return {
      success: true,
      text: polishedText,
      polished: true,
      elapsed,
      preset: presetId,
      ...(detectedApp ? { detectedApp: detectedApp.name } : {}),
    };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    const message = err.name === "AbortError" ? "Timeout" : err.message;
    debugLogger.warn("[WhisperWoof] Ollama polish failed, using raw text", {
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
