/**
 * Ollama Bridge — Main process bridge for WhisperWoof's text polish
 *
 * Supports multiple LLM providers (BYOM — Bring Your Own Model):
 * - Ollama (local, default)
 * - OpenAI (GPT-4o-mini, GPT-4o)
 * - Anthropic (Claude Haiku, Sonnet)
 * - Groq (fast cloud inference)
 *
 * Falls back to raw text on any failure.
 */

const debugLogger = require("../../helpers/debugLogger");

const { getPresetPrompt, DEFAULT_PRESET_ID } = require("./polish-presets");
const { detectContextPreset } = require("./context-detector");
const { polishWithProvider } = require("./llm-providers");
const { buildStylePrompt } = require("./style-learner");
const { hasBacktrack, applyBacktrackCorrection } = require("./backtrack");

const DEFAULT_BASE_URL = "http://localhost:11434";

async function polishWithOllama(text, options = {}) {
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

  // Adaptive learning: inject few-shot style examples if available
  const styleSection = options.adaptiveLearning !== false ? buildStylePrompt(text) : "";

  let systemPrompt = customPrompt
    ? `${basePrompt}\n\nAdditional instructions from user:\n${customPrompt}`
    : basePrompt;

  if (styleSection) {
    systemPrompt += styleSection;
  }

  if (!text || !text.trim()) {
    return { success: true, text: text || "", polished: false };
  }

  // Backtrack correction: resolve self-corrections before polishing
  let textToPolish = text;
  let backtrackApplied = false;

  if (options.backtrack !== false && hasBacktrack(text)) {
    const backtrackResult = await applyBacktrackCorrection(text, {
      baseUrl: options.baseUrl || DEFAULT_BASE_URL,
      model: options.model,
      timeoutMs: options.timeoutMs,
    });
    if (backtrackResult.corrected) {
      textToPolish = backtrackResult.text;
      backtrackApplied = true;
      debugLogger.info("[WhisperWoof] Backtrack pre-pass completed", {
        signals: backtrackResult.signals,
      });
    }
  }

  // Dispatch to the configured provider (defaults to Ollama)
  const result = await polishWithProvider(textToPolish, systemPrompt, {
    provider: options.provider || "ollama",
    model: options.model,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl || DEFAULT_BASE_URL,
    timeoutMs: options.timeoutMs,
  });

  return {
    success: true,
    text: result.text,
    polished: result.polished,
    backtrackApplied,
    elapsed: result.elapsed,
    preset: presetId,
    provider: result.provider,
    ...(result.error ? { error: result.error } : {}),
    ...(detectedApp ? { detectedApp: detectedApp.name } : {}),
  };
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
