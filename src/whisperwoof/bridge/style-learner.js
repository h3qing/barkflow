/**
 * Style Learner — Adaptive polish that learns from user edits
 *
 * Captures before/after pairs when the user edits polished text.
 * Injects the best examples as few-shot demonstrations in the polish prompt.
 *
 * Competitive feature: Willow Voice learns writing style, SuperWhisper
 * remembers corrected spellings. WhisperWoof goes further — full style
 * adaptation via few-shot learning.
 *
 * Storage: ~/.config/WhisperWoof/whisperwoof-style-examples.json
 * Format: Array of { polished, edited, timestamp, similarity }
 * Max: 50 examples (oldest pruned first)
 */

const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const debugLogger = require("../../helpers/debugLogger");

const STYLE_FILE = path.join(app.getPath("userData"), "whisperwoof-style-examples.json");
const MAX_EXAMPLES = 50;
const MIN_EDIT_DISTANCE_RATIO = 0.05; // Minimum 5% change to count as a meaningful edit
const MAX_PROMPT_EXAMPLES = 5;

/**
 * Load style examples from disk.
 */
function loadExamples() {
  try {
    if (fs.existsSync(STYLE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STYLE_FILE, "utf-8"));
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    debugLogger.warn("[WhisperWoof] Failed to load style examples", { error: err.message });
  }
  return [];
}

/**
 * Save style examples to disk.
 */
function saveExamples(examples) {
  try {
    fs.writeFileSync(STYLE_FILE, JSON.stringify(examples, null, 2), "utf-8");
  } catch (err) {
    debugLogger.warn("[WhisperWoof] Failed to save style examples", { error: err.message });
  }
}

/**
 * Simple Levenshtein distance (for edit distance ratio).
 */
function editDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Record a style example (polished text → user's edited version).
 * Only records if the edit is meaningful (>5% change).
 */
function recordStyleExample(polishedText, editedText) {
  if (!polishedText || !editedText) return false;

  const polished = polishedText.trim();
  const edited = editedText.trim();

  // Skip if identical
  if (polished === edited) return false;

  // Skip if too short
  if (polished.length < 10 || edited.length < 10) return false;

  // Check edit distance ratio
  const distance = editDistance(polished, edited);
  const maxLen = Math.max(polished.length, edited.length);
  const ratio = distance / maxLen;

  // Skip trivial edits (< 5% change) — likely just cursor movement
  if (ratio < MIN_EDIT_DISTANCE_RATIO) return false;

  // Skip massive changes (> 80% different) — user rewrote entirely, not a style signal
  if (ratio > 0.8) return false;

  const examples = loadExamples();

  // Dedup: skip if we already have a very similar example
  const isDuplicate = examples.some((ex) => {
    const d = editDistance(ex.polished, polished);
    return d / Math.max(ex.polished.length, polished.length) < 0.1;
  });
  if (isDuplicate) return false;

  const example = {
    polished: polished.slice(0, 500), // Cap length
    edited: edited.slice(0, 500),
    timestamp: new Date().toISOString(),
    editRatio: Math.round(ratio * 100) / 100,
  };

  examples.push(example);

  // Prune oldest if over limit
  const pruned = examples.length > MAX_EXAMPLES
    ? examples.slice(examples.length - MAX_EXAMPLES)
    : examples;

  saveExamples(pruned);

  debugLogger.info("[WhisperWoof] Style example recorded", {
    editRatio: example.editRatio,
    total: pruned.length,
  });

  return true;
}

/**
 * Build a few-shot style section to append to the polish prompt.
 * Selects the most relevant examples based on input length similarity.
 */
function buildStylePrompt(inputText) {
  const examples = loadExamples();
  if (examples.length === 0) return "";

  const inputLen = inputText.length;

  // Score examples by relevance (prefer similar length, recent)
  const scored = examples.map((ex, idx) => {
    const lenDiff = Math.abs(ex.polished.length - inputLen) / Math.max(ex.polished.length, inputLen);
    const recency = idx / examples.length; // 0 = oldest, 1 = newest
    const score = (1 - lenDiff) * 0.6 + recency * 0.4;
    return { ...ex, score };
  });

  // Sort by score descending, take top N
  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, MAX_PROMPT_EXAMPLES);

  if (selected.length === 0) return "";

  const lines = selected.map((ex) =>
    `Example:\nBefore: "${ex.polished.slice(0, 200)}"\nAfter: "${ex.edited.slice(0, 200)}"`
  );

  return (
    "\n\nThe user has previously edited polished text in these ways. " +
    "Adapt your style to match their preferences:\n\n" +
    lines.join("\n\n")
  );
}

/**
 * Get style learning stats (for settings UI).
 */
function getStyleStats() {
  const examples = loadExamples();
  return {
    exampleCount: examples.length,
    maxExamples: MAX_EXAMPLES,
    oldestExample: examples.length > 0 ? examples[0].timestamp : null,
    newestExample: examples.length > 0 ? examples[examples.length - 1].timestamp : null,
  };
}

/**
 * Clear all style examples (reset learning).
 */
function clearStyleExamples() {
  saveExamples([]);
  return { success: true };
}

/**
 * Get all style examples (for debugging/review).
 */
function getStyleExamples() {
  return loadExamples();
}

module.exports = {
  recordStyleExample,
  buildStylePrompt,
  getStyleStats,
  clearStyleExamples,
  getStyleExamples,
  editDistance,
};
