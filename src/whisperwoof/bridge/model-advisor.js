/**
 * Model Advisor — Recommends Whisper model based on system memory
 *
 * Detects available RAM and recommends the best model that will
 * run reliably without GPU memory crashes.
 *
 * Memory requirements (approximate, with GPU acceleration):
 *   Tiny:    ~200MB  (75MB model + overhead)
 *   Base:    ~400MB  (142MB model + overhead)
 *   Small:   ~1GB    (466MB model + overhead)
 *   Medium:  ~3GB    (1.5GB model + overhead)
 *   Large:   ~6GB    (3GB model + overhead)
 *   Turbo:   ~3.5GB  (1.6GB model + overhead)
 */

const os = require("os");
const debugLogger = require("../../helpers/debugLogger");

const MODEL_REQUIREMENTS = {
  tiny:   { ramGB: 2,  label: "Tiny",   sizeMB: 75,   quality: "Basic — fastest, more errors" },
  base:   { ramGB: 4,  label: "Base",   sizeMB: 142,  quality: "Good — fast, occasional errors" },
  small:  { ramGB: 8,  label: "Small",  sizeMB: 466,  quality: "Great — best balance of speed and accuracy" },
  medium: { ramGB: 16, label: "Medium", sizeMB: 1500, quality: "Excellent — slower, very accurate" },
  large:  { ramGB: 32, label: "Large",  sizeMB: 3000, quality: "Best — slowest, highest accuracy" },
  turbo:  { ramGB: 16, label: "Turbo",  sizeMB: 1600, quality: "Fast + accurate — optimized large model" },
};

// Priority order: prefer accuracy within memory budget
const RECOMMENDATION_ORDER = ["turbo", "medium", "small", "base", "tiny"];

function getSystemMemoryGB() {
  return Math.round(os.totalmem() / (1024 * 1024 * 1024));
}

/**
 * Get the recommended model for this system.
 */
function getRecommendedModel() {
  const ramGB = getSystemMemoryGB();

  // Find the best model that fits in memory
  // Rule: model needs ~2x its size in RAM for comfortable GPU operation
  let recommended = "base"; // safe fallback

  for (const modelId of RECOMMENDATION_ORDER) {
    const req = MODEL_REQUIREMENTS[modelId];
    if (ramGB >= req.ramGB) {
      recommended = modelId;
      break;
    }
  }

  debugLogger.debug("[WhisperWoof] Model recommendation", {
    systemRAM: `${ramGB}GB`,
    recommended,
    reason: `${MODEL_REQUIREMENTS[recommended].label} fits within ${ramGB}GB RAM`,
  });

  return {
    recommended,
    systemRAM: ramGB,
    models: Object.entries(MODEL_REQUIREMENTS).map(([id, req]) => ({
      id,
      ...req,
      fits: ramGB >= req.ramGB,
      recommended: id === recommended,
      warning: ramGB < req.ramGB
        ? `Needs ${req.ramGB}GB+ RAM (you have ${ramGB}GB). May crash or run slowly.`
        : null,
    })),
  };
}

/**
 * Get a friendly error message when a model fails to load.
 */
function getModelFailureAdvice(failedModel, stderr) {
  const ramGB = getSystemMemoryGB();
  const req = MODEL_REQUIREMENTS[failedModel];
  const rec = getRecommendedModel();

  if (!req) {
    return {
      title: "Model failed to load",
      message: "The selected model couldn't start. Try a smaller model.",
      recommendation: rec.recommended,
    };
  }

  const isMemoryIssue = ramGB < req.ramGB ||
    (stderr && (stderr.includes("loading model") || stderr.includes("memory")));

  if (isMemoryIssue) {
    return {
      title: `${req.label} model is too large for your Mac`,
      message: `The ${req.label} model needs ${req.ramGB}GB+ of memory, but your Mac has ${ramGB}GB. ` +
        `We recommend the ${MODEL_REQUIREMENTS[rec.recommended].label} model instead — ` +
        `${MODEL_REQUIREMENTS[rec.recommended].quality.toLowerCase()}.`,
      recommendation: rec.recommended,
    };
  }

  return {
    title: `${req.label} model failed to start`,
    message: "The model couldn't initialize. This might be a corrupted download — try deleting and re-downloading it.",
    recommendation: rec.recommended,
  };
}

module.exports = {
  getRecommendedModel,
  getModelFailureAdvice,
  getSystemMemoryGB,
  MODEL_REQUIREMENTS,
};
