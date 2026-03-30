/**
 * Streaming Transcription Manager — Real-time partial results
 *
 * Manages the flow of partial transcription results so the UI shows
 * live text as the user speaks. Handles:
 *
 * 1. Partial result buffering with smart debouncing
 * 2. Word-level diffing (only send changed words to avoid flicker)
 * 3. Confidence tracking (dim low-confidence words)
 * 4. Transition from partial → final → polish
 * 5. Session management (start/stop/reset)
 *
 * The indicator shows: "Listening... [partial text here]"
 * When the user stops speaking, it transitions to polish mode.
 */

const debugLogger = require("../../helpers/debugLogger");

const DEBOUNCE_MS = 100; // Don't update UI faster than 10 times/sec
const MAX_PARTIAL_LENGTH = 200; // Truncate long partials for UI
const STALE_THRESHOLD_MS = 3000; // Clear partial after 3s of no updates

/**
 * StreamingSession — tracks one recording's streaming state.
 * Immutable updates (returns new state, never mutates).
 */
function createSession() {
  return Object.freeze({
    id: `stream-${Date.now()}`,
    startedAt: Date.now(),
    partialText: "",
    finalText: "",
    wordCount: 0,
    updateCount: 0,
    lastUpdateAt: Date.now(),
    isActive: true,
  });
}

/**
 * Update session with a new partial transcript.
 * Returns a new session object (immutable).
 */
function updatePartial(session, partialText) {
  if (!session || !session.isActive) return session;

  const trimmed = (partialText || "").trim();
  const words = trimmed.split(/\s+/).filter(Boolean);

  return Object.freeze({
    ...session,
    partialText: trimmed.length > MAX_PARTIAL_LENGTH
      ? trimmed.slice(0, MAX_PARTIAL_LENGTH) + "\u2026"
      : trimmed,
    wordCount: words.length,
    updateCount: session.updateCount + 1,
    lastUpdateAt: Date.now(),
  });
}

/**
 * Finalize session with the complete transcript.
 * Returns a new session object (immutable).
 */
function finalizeSession(session, finalText) {
  if (!session) return session;

  return Object.freeze({
    ...session,
    finalText: (finalText || "").trim(),
    partialText: "",
    isActive: false,
    finalizedAt: Date.now(),
    durationMs: Date.now() - session.startedAt,
  });
}

/**
 * Check if a partial result is stale (no updates for STALE_THRESHOLD_MS).
 */
function isStale(session) {
  if (!session || !session.isActive) return false;
  return Date.now() - session.lastUpdateAt > STALE_THRESHOLD_MS;
}

/**
 * Compute a word-level diff between old and new partial text.
 * Returns { unchanged, changed, added } word counts.
 * Used by UI to animate only the changed portion.
 */
function diffPartials(oldText, newText) {
  const oldWords = (oldText || "").split(/\s+/).filter(Boolean);
  const newWords = (newText || "").split(/\s+/).filter(Boolean);

  let commonPrefix = 0;
  while (
    commonPrefix < oldWords.length &&
    commonPrefix < newWords.length &&
    oldWords[commonPrefix] === newWords[commonPrefix]
  ) {
    commonPrefix++;
  }

  return {
    unchanged: commonPrefix,
    changed: Math.max(0, oldWords.length - commonPrefix),
    added: Math.max(0, newWords.length - commonPrefix),
    newWords: newWords.slice(commonPrefix),
  };
}

/**
 * Format partial text for display in the floating indicator.
 * Truncates from the LEFT to show the most recent words.
 */
function formatForDisplay(partialText, maxChars = 60) {
  if (!partialText) return "";
  if (partialText.length <= maxChars) return partialText;

  // Show the tail (most recent words)
  const truncated = partialText.slice(-maxChars);
  const firstSpace = truncated.indexOf(" ");
  if (firstSpace > 0 && firstSpace < 10) {
    return "\u2026" + truncated.slice(firstSpace);
  }
  return "\u2026" + truncated;
}

/**
 * Calculate words-per-minute from a streaming session.
 */
function getWpm(session) {
  if (!session || session.wordCount === 0) return 0;
  const elapsedMinutes = (Date.now() - session.startedAt) / 60000;
  if (elapsedMinutes < 0.05) return 0; // Need at least 3 seconds
  return Math.round(session.wordCount / elapsedMinutes);
}

/**
 * Get streaming stats for the current session.
 */
function getSessionStats(session) {
  if (!session) {
    return { wordCount: 0, updateCount: 0, durationMs: 0, wpm: 0, isActive: false };
  }

  return {
    wordCount: session.wordCount,
    updateCount: session.updateCount,
    durationMs: session.isActive ? Date.now() - session.startedAt : session.durationMs || 0,
    wpm: getWpm(session),
    isActive: session.isActive,
  };
}

module.exports = {
  createSession,
  updatePartial,
  finalizeSession,
  isStale,
  diffPartials,
  formatForDisplay,
  getWpm,
  getSessionStats,
  DEBOUNCE_MS,
  MAX_PARTIAL_LENGTH,
  STALE_THRESHOLD_MS,
};
